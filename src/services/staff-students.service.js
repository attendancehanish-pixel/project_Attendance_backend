import prisma from '../lib/prisma.js';
import { todayKey, endOfDay, parseSchoolDateStrict } from '../utils/date.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function getActiveAcademicYear() {
  const year = await prisma.academicYear.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { startDate: "desc" },
  });
  if (!year) throw new Error("No active academic year found");
  return year;
}

async function getStaffByUserId(userId) {
  const staff = await prisma.staff.findUnique({ where: { userId } });
  if (!staff) throw new Error("Staff profile not found");
  return staff;
}

/* ------------------------------------------------------------------ */
/* 1. List students (filter + search + paginate)                       */
/* ------------------------------------------------------------------ */

export async function listStudents({
  userId,
  search = "",
  standardId,
  status,
  page = 1,
  pageSize = 20,
  sortBy = "name",
  sortDir = "asc",
}) {
  const staff = await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();

  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = (pageNum - 1) * size;

  /* Build the enrollment filter. */
  const enrollmentWhere = {
    academicYearId: year.id,
    ...(standardId ? { standardId } : {}),
    ...(status ? { status } : {}),
  };

  /* Search matches admission no OR name OR email. */
  const searchTrim = search.trim();
  const studentWhere = searchTrim
    ? {
        OR: [
          { admissionNo: { contains: searchTrim } },
          { name: { contains: searchTrim } },
          { email: { contains: searchTrim } },
        ],
      }
    : {};

  const where = {
    AND: [{ enrollments: { some: enrollmentWhere } }, studentWhere],
  };

  const orderBy =
    sortBy === "admissionNo"
      ? { admissionNo: sortDir }
      : sortBy === "rollNo"
      ? { enrollments: { _count: sortDir } } // fallback, we sort in memory for rollNo
      : { name: sortDir };

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
    const enrollment = s.enrollments[0];
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

  if (!student) throw new Error("Student not found");

  const enrollment = student.enrollments[0];

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
  };
}

/* ------------------------------------------------------------------ */
/* 3. Absence sessions for a student                                   */
/* ------------------------------------------------------------------ */

/**
 * Returns every period where the student was marked ABSENT (or a
 * non-present status), with subject, teacher, date, period info,
 * and remarks.
 */
export async function getStudentAbsenceSessions({
  userId,
  studentId,
  from,
  to,
  limit = 100,
}) {
  await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();

  const dateFilter = {};
  if (from) dateFilter.gte = parseSchoolDateStrict(from, 'from');
  if (to) dateFilter.lte = endOfDay(parseSchoolDateStrict(to, 'to'));

  const records = await prisma.studentAttendance.findMany({
    where: {
      enrollment: { studentId },
      status: { in: ["ABSENT", "LATE", "EXCUSED"] },
      session: {
        academicYearId: year.id,
        ...(Object.keys(dateFilter).length
          ? { attendanceDate: dateFilter }
          : {}),
      },
    },
    include: {
      absenceType: true,
      enrollment: {
        include: { student: true, standard: true, academicYear: true },
      },
      markedBy: { select: { id: true, name: true } },
      session: {
        include: {
          period: true,
          subject: true,
          standard: true,
          staff: { include: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ session: { attendanceDate: "desc" } }],
    take: Math.min(500, Number(limit) || 100),
  });

  const sessions = records.map((r) => ({
    id: r.id,
    date: todayKey(r.session.attendanceDate),
    periodIndex: r.session.period.periodIndex,
    startTime: r.session.period.startTime,
    endTime: r.session.period.endTime,
    subject: r.session.subject.name,
    standardName: r.session.standard.name,
    teacherName: r.session.staff?.user?.name || null,
    status: r.status,
    absenceType: r.absenceType?.name || null,
    remarks: null,
    markedBy: r.markedBy?.name || null,
    markedAt: r.markedAt,
  }));

  const summary = {
    total: sessions.length,
    absent: sessions.filter((s) => s.status === "ABSENT").length,
    late: sessions.filter((s) => s.status === "LATE").length,
    excused: sessions.filter((s) => s.status === "EXCUSED").length,
  };

  return { studentId, summary, sessions };
}

/* ------------------------------------------------------------------ */
/* 4. Class options for the filter dropdown                            */
/* ------------------------------------------------------------------ */

export async function getStudentFilterOptions(s) {
  
  const year = await getActiveAcademicYear();

  const standards = await prisma.standard.findMany({
    orderBy: { name: "asc" },
    include: {
      enrollments: {
        where: { academicYearId: year.id, status: "ACTIVE" },
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