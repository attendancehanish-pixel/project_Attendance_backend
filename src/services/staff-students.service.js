import prisma from '../lib/prisma.js';
import { todayKey, endOfDay, weekdayOf, parseSchoolDateStrict } from '../utils/date.js';
import { getCurrentAcademicYear } from '../utils/academic-year.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const getActiveAcademicYear = getCurrentAcademicYear;

async function getStaffByUserId(userId) {
  const staff = await prisma.staff.findUnique({ where: { userId } });
  if (!staff) throw new Error('Staff profile not found');
  return staff;
}

const round1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* 1. List students (search + class filter + pagination)               */
/* ------------------------------------------------------------------ */

const SORTABLE = { name: 'name', admissionNo: 'admissionNo' };

export async function listStudents({
  userId,
  search = '',
  standardId,
  status,
  page = 1,
  pageSize = 15,
  sortBy = 'name',
  sortDir = 'asc',
}) {
  const staff = await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();

  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 15));
  const skip = (pageNum - 1) * size;

  // Class + status apply to the student's enrollment in this academic year.
  const enrollmentWhere = {
    academicYearId: year.id,
    ...(standardId ? { standardId } : {}),
    ...(status ? { status } : {}),
  };

  // Search by name OR admission number (case-insensitive, partial match).
  const term = String(search || '').trim();
  const searchWhere = term
    ? {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { admissionNo: { contains: term, mode: 'insensitive' } },
        ],
      }
    : {};

  const where = { AND: [{ enrollments: { some: enrollmentWhere } }, searchWhere] };

  const sortField = SORTABLE[sortBy] || 'name';
  const dir = String(sortDir).toLowerCase() === 'desc' ? 'desc' : 'asc';
  // id as a tie-breaker keeps pagination stable between pages.
  const orderBy = [{ [sortField]: dir }, { id: 'asc' }];

  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy,
      skip,
      take: size,
      include: {
        enrollments: {
          where: { academicYearId: year.id },
          include: { standard: true },
        },
      },
    }),
  ]);

  const rows = students.map((s) => {
    // Prefer the enrollment that matches the class filter.
    const enrollment =
      s.enrollments.find((e) => !standardId || e.standardId === standardId) || s.enrollments[0];
    return {
      id: s.id,
      admissionNo: s.admissionNo,
      name: s.name,
      email: s.email,
      phone: s.phone,
      status: s.status,
      standardId: enrollment?.standardId || null,
      standardName: enrollment?.standard?.name || null,
      rollNo: enrollment?.rollNo || null,
      enrollmentStatus: enrollment?.status || null,
    };
  });

  return {
    academicYear: { id: year.id, name: year.name },
    staff: { id: staff.id },
    pagination: {
      page: pageNum,
      pageSize: size,
      total,
      totalPages: Math.ceil(total / size) || 1,
    },
    students: rows,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Single student details                                           */
/* ------------------------------------------------------------------ */

export async function getStudentDetails({ userId, studentId }) {
  await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        where: { academicYearId: year.id },
        include: { standard: true },
      },
    },
  });

  if (!student) throw new Error('Student not found');

  const enrollment = student.enrollments[0];

  let classTeacher = null;
  if (enrollment) {
    const ct = await prisma.classTeacher.findUnique({
      where: {
        academicYearId_standardId: {
          academicYearId: year.id,
          standardId: enrollment.standardId,
        },
      },
      include: { staff: { include: { user: { select: { name: true } } } } },
    });
    classTeacher = ct?.staff?.user?.name || null;
  }

  return {
    id: student.id,
    admissionNo: student.admissionNo,
    name: student.name,
    email: student.email,
    phone: student.phone,
    status: student.status,
    standardId: enrollment?.standardId || null,
    standardName: enrollment?.standard?.name || null,
    rollNo: enrollment?.rollNo || null,
    classTeacher,
    academicYear: { id: year.id, name: year.name },
  };
}

/* ------------------------------------------------------------------ */
/* 3. Absence details for one student                                  */
/* ------------------------------------------------------------------ */

/**
 * Everything staff need to understand a student's absences:
 *  - summary: attendance %, periods missed, late, excused, days affected
 *  - days: day-wise list; each day lists the missed periods with subject,
 *          teacher, time, absence type, who marked it and any correction
 *  - bySubject / byPeriod: patterns (which subject / which period is missed most)
 *
 * Attendance % counts PRESENT and LATE as attended.
 */
export async function getStudentAbsenceSessions({ userId, studentId, from, to }) {
  await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();

  const dateFilter = {};
  if (from) dateFilter.gte = parseSchoolDateStrict(from, 'from');
  if (to) dateFilter.lte = endOfDay(parseSchoolDateStrict(to, 'to'));

  // Every marked period in range (all statuses) so percentages are real.
  const records = await prisma.studentAttendance.findMany({
    where: {
      enrollment: { studentId },
      session: {
        academicYearId: year.id,
        ...(Object.keys(dateFilter).length ? { attendanceDate: dateFilter } : {}),
      },
    },
    select: {
      id: true,
      status: true,
      markedAt: true,
      absenceType: { select: { name: true } },
      markedBy: { select: { name: true } },
      corrections: { select: { status: true, oldStatus: true, newStatus: true } },
      session: {
        select: {
          attendanceDate: true,
          source: true,
          subject: { select: { id: true, name: true } },
          period: { select: { periodIndex: true, startTime: true, endTime: true } },
          staff: { select: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ session: { attendanceDate: 'desc' } }, { session: { period: { periodIndex: 'asc' } } }],
    take: 5000,
  });

  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  const dayMap = new Map(); // date -> { marked, absent, periods[] }
  const subjectMap = new Map();
  const periodMap = new Map();

  for (const r of records) {
    const date = todayKey(r.session.attendanceDate);
    const subj = r.session.subject;
    const idx = r.session.period.periodIndex;

    counts[r.status] = (counts[r.status] || 0) + 1;

    const day = dayMap.get(date) || {
      date,
      weekday: weekdayOf(r.session.attendanceDate),
      periodsMarked: 0,
      absentCount: 0,
      periods: [],
    };
    day.periodsMarked += 1;
    if (r.status === 'ABSENT') day.absentCount += 1;
    dayMap.set(date, day);

    const sub = subjectMap.get(subj.id) || {
      subjectId: subj.id,
      subject: subj.name,
      markedPeriods: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    sub.markedPeriods += 1;
    if (r.status === 'ABSENT') sub.absent += 1;
    if (r.status === 'LATE') sub.late += 1;
    if (r.status === 'EXCUSED') sub.excused += 1;
    subjectMap.set(subj.id, sub);

    if (r.status !== 'PRESENT') {
      const per = periodMap.get(idx) || { periodIndex: idx, missed: 0 };
      per.missed += 1;
      periodMap.set(idx, per);

      day.periods.push({
        id: r.id,
        periodIndex: idx,
        startTime: r.session.period.startTime,
        endTime: r.session.period.endTime,
        subject: subj.name,
        teacherName: r.session.staff?.user?.name || null,
        status: r.status,
        absenceType: r.absenceType?.name || null,
        markedBy: r.markedBy?.name || null,
        markedAt: r.markedAt,
        source: r.session.source,
        corrected: r.corrections.some((c) => c.status === 'APPROVED'),
        correctionPending: r.corrections.some((c) => c.status === 'PENDING'),
      });
    }
  }

  const allDays = [...dayMap.values()];
  const days = allDays
    .filter((d) => d.periods.length > 0)
    .map((d) => ({
      ...d,
      periods: d.periods.sort((a, b) => a.periodIndex - b.periodIndex),
      fullDayAbsent: d.periodsMarked > 0 && d.absentCount === d.periodsMarked,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const marked = records.length;
  const attended = counts.PRESENT + counts.LATE;

  const summary = {
    periodsMarked: marked,
    present: counts.PRESENT,
    absent: counts.ABSENT,
    late: counts.LATE,
    excused: counts.EXCUSED,
    attendancePercent: marked ? round1((attended / marked) * 100) : null,
    daysTracked: allDays.length,
    daysWithAbsence: days.length,
    fullDayAbsences: days.filter((d) => d.fullDayAbsent).length,
  };

  const bySubject = [...subjectMap.values()]
    .map((s) => ({
      ...s,
      missedPercent: s.markedPeriods ? round1(((s.absent + s.excused) / s.markedPeriods) * 100) : 0,
    }))
    .filter((s) => s.absent + s.late + s.excused > 0)
    .sort((a, b) => b.absent - a.absent || b.late - a.late);

  const byPeriod = [...periodMap.values()].sort((a, b) => a.periodIndex - b.periodIndex);

  return {
    studentId,
    academicYear: { id: year.id, name: year.name },
    range: { from: from || null, to: to || null },
    summary,
    days,
    bySubject,
    byPeriod,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Class options for the filter dropdown                            */
/* ------------------------------------------------------------------ */

export async function getStudentFilterOptions() {
  const year = await getActiveAcademicYear();

  const standards = await prisma.standard.findMany({
    orderBy: { name: 'asc' },
    include: {
      enrollments: {
        where: { academicYearId: year.id, status: 'ACTIVE' },
        select: { id: true },
      },
    },
  });

  return {
    academicYear: { id: year.id, name: year.name },
    standards: standards.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      studentCount: s.enrollments.length,
    })),
  };
}
