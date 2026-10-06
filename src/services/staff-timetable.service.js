import { weekdayOf, businessNow, todayKey, endOfDay, parseSchoolDateStrict } from '../utils/date.js';
import prisma from '../lib/prisma.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const WEEKDAY_MAP = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const WEEKDAY_LABELS = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

/**
 * Returns the active academic year for the system.
 * Adjust the filter if you scope by school/tenant.
 */
async function getActiveAcademicYear() {
  const year = await prisma.academicYear.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { startDate: "desc" },
  });

  if (!year) {
    throw new Error("No active academic year found");
  }

  return year;
}

async function getStaffByUserId(userId) {
  const staff = await prisma.staff.findUnique({
    where: { userId },
    include: { user: true },
  });

  if (!staff) {
    throw new Error("Staff profile not found");
  }

  return staff;
}

/**
 * Builds a map of periodIndex -> periodId for a given weekday,
 * using the Period table (academicYear + weekday + periodIndex).
 */
function buildPeriodMap(periods, weekday) {
  return periods
    .filter((p) => p.weekday === weekday)
    .reduce((acc, p) => {
      acc[p.periodIndex] = p;
      return acc;
    }, {});
}

/* ------------------------------------------------------------------ */
/* 1. My Timetable (weekly grid of the logged-in staff)                */
/* ------------------------------------------------------------------ */

export async function getMyWeeklyTimetable(userId) {
  const staff = await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();

  const [periods, entries, substitutions, dateEntries] = await Promise.all([
    prisma.period.findMany({
      where: { academicYearId: year.id },
      orderBy: [{ weekday: "asc" }, { periodIndex: "asc" }],
    }),

    prisma.timetableEntry.findMany({
      where: {
        academicYearId: year.id,
        subject: {
          allocations: {
            some: {
              staffAssignments: { some: { staffId: staff.id } },
            },
          },
        },
      },
      include: {
        subject: true,
        standard: true,
        period: true,
      },
    }),

    prisma.periodSubstitution.findMany({
      where: {
        substituteStaffId: staff.id,
        substitutionDate: { gte: year.startDate, lte: year.endDate },
      },
      include: {
        period: true,
        standard: true,
        subject: true,
        originalStaff: { include: { user: true } },
      },
    }),

    prisma.dateSpecificTimetableEntry.findMany({
      where: {
        academicYearId: year.id,
        subject: {
          allocations: {
            some: {
              staffAssignments: { some: { staffId: staff.id } },
            },
          },
        },
      },
      include: { period: true, standard: true, subject: true },
    }),
  ]);

  // Group periods by weekday
  const periodsByWeekday = periods.reduce((acc, p) => {
    if (!acc[p.weekday]) acc[p.weekday] = [];
    acc[p.weekday].push(p);
    return acc;
  }, {});

  // Shape the normal timetable
  const timetable = {};
  const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

  for (const weekday of weekdays) {
    timetable[weekday] = {};

    const weekdayEntries = entries.filter((e) => e.weekday === weekday);

    for (const entry of weekdayEntries) {
      timetable[weekday][entry.period.periodIndex] = {
        classId: entry.standard.id,
        className: entry.standard.name,
        subject: entry.subject.name,
        subjectId: entry.subject.id,
        room: null, // schema has no room on TimetableEntry; add later
        teacher: staff.user.name,
      };
    }
  }

  // Summary
  const weeklyPeriods = Object.values(timetable).reduce(
    (sum, day) => sum + Object.keys(day).length,
    0
  );

  const uniqueClasses = new Set();
  const uniqueSubjects = new Set();
  for (const day of Object.values(timetable)) {
    for (const slot of Object.values(day)) {
      uniqueClasses.add(slot.classId);
      uniqueSubjects.add(slot.subjectId);
    }
  }

  const todayName = WEEKDAY_MAP.indexOf(weekdayOf(businessNow())) >= 0 ? weekdayOf(businessNow()) : WEEKDAY_MAP[0];
  const todayCount = Object.keys(timetable[todayName] || {}).length;

  return {
    staff: {
      id: staff.id,
      name: staff.user.name,
      employeeCode: staff.employeeCode,
    },
    academicYear: { id: year.id, name: year.name },
    weekdays,
    weekdayLabels: WEEKDAY_LABELS,
    periods: buildPeriodList(periods),
    timetable,
    substitutions: substitutions.map((s) => ({
      id: s.id,
      date: todayKey(s.substitutionDate),
      period: s.period.periodIndex,
      className: s.standard.name,
      subject: s.subject.name,
      originalTeacher: s.originalStaff.user.name,
      reason: s.remarks,
    })),
    dateSpecificEntries: dateEntries.map((d) => ({
      id: d.id,
      date: todayKey(d.calendarDate),
      period: d.period.periodIndex,
      className: d.standard.name,
      subject: d.subject.name,
    })),
    summary: {
      weeklyPeriods,
      classes: uniqueClasses.size,
      subjects: uniqueSubjects.size,
      today: todayCount,
    },
  };
}

/**
 * Builds a unique list of periods (by periodIndex) for the grid rows.
 * Assumes periodIndex is consistent across weekdays.
 */
function buildPeriodList(periods) {
  const byIndex = new Map();

  for (const p of periods) {
    if (!byIndex.has(p.periodIndex)) {
      byIndex.set(p.periodIndex, {
        id: p.id,
        index: p.periodIndex,
        startTime: p.startTime,
        endTime: p.endTime,
      });
    }
  }

  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
}

/* ------------------------------------------------------------------ */
/* 2. Class Timetable (complete normal timetable for one class)        */
/* ------------------------------------------------------------------ */

export async function getClassTimetable(standardId) {
  const year = await getActiveAcademicYear();

  const standard = await prisma.standard.findUnique({
    where: { id: standardId },
  });

  if (!standard) {
    throw new Error("Class not found");
  }

  const [periods, entries, staffAssignments] = await Promise.all([
    prisma.period.findMany({
      where: { academicYearId: year.id },
      orderBy: [{ weekday: "asc" }, { periodIndex: "asc" }],
    }),
    prisma.timetableEntry.findMany({
      where: { academicYearId: year.id, standardId },
      include: { subject: true, period: true },
    }),
    prisma.staffSubjectAssignment.findMany({
      where: {
        subjectAllocation: { academicYearId: year.id, standardId },
      },
      include: { staff: { include: { user: true } }, subjectAllocation: true },
    }),
  ]);

  // Map subjectId -> teacher name for this class
  const subjectTeacher = {};
  for (const sa of staffAssignments) {
    subjectTeacher[sa.subjectAllocation.subjectId] = sa.staff.user.name;
  }

  const timetable = {};
  const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

  for (const weekday of weekdays) {
    timetable[weekday] = {};
    for (const entry of entries.filter((e) => e.weekday === weekday)) {
      timetable[weekday][entry.period.periodIndex] = {
        subject: entry.subject.name,
        teacher: subjectTeacher[entry.subjectId] || null,
        room: null,
      };
    }
  }

  return {
    standard: { id: standard.id, code: standard.code, name: standard.name },
    academicYear: { id: year.id, name: year.name },
    weekdays,
    weekdayLabels: WEEKDAY_LABELS,
    periods: buildPeriodList(periods),
    timetable,
  };
}

export async function getClassList() {
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

  return standards.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    studentCount: s.enrollments.length,
  }));
}

/* ------------------------------------------------------------------ */
/* 3. Changes (date-specific entries + substitutions)                  */
/* ------------------------------------------------------------------ */

export async function getTimetableChanges({ standardId, from, to } = {}) {
  const year = await getActiveAcademicYear();

  const dateFilter = {};
  if (from) dateFilter.gte = parseSchoolDateStrict(from, 'from');
  if (to) dateFilter.lte = endOfDay(parseSchoolDateStrict(to, 'to'));

  const standardFilter = standardId ? { standardId } : {};

  const [dateEntries, substitutions] = await Promise.all([
    prisma.dateSpecificTimetableEntry.findMany({
      where: {
        academicYearId: year.id,
        ...standardFilter,
        ...(Object.keys(dateFilter).length
          ? { calendarDate: dateFilter }
          : {}),
      },
      include: { period: true, standard: true, subject: true },
      orderBy: { calendarDate: "asc" },
    }),

    prisma.periodSubstitution.findMany({
      where: {
        ...(Object.keys(dateFilter).length
          ? { substitutionDate: dateFilter }
          : {}),
        ...(standardId ? { standardId } : {}),
      },
      include: {
        period: true,
        standard: true,
        subject: true,
        originalStaff: { include: { user: true } },
        substituteStaff: { include: { user: true } },
      },
      orderBy: { substitutionDate: "asc" },
    }),
  ]);

  return {
    dateSpecific: dateEntries.map((d) => ({
      id: d.id,
      date: todayKey(d.calendarDate),
      className: d.standard.name,
      standardId: d.standardId,
      period: d.period.periodIndex,
      subject: d.subject.name,
      teacher: null,
      room: null,
      reason: "Date-specific timetable override",
    })),
    substitutions: substitutions.map((s) => ({
      id: s.id,
      date: todayKey(s.substitutionDate),
      period: s.period.periodIndex,
      className: s.standard.name,
      standardId: s.standardId,
      subject: s.subject.name,
      originalTeacher: s.originalStaff.user.name,
      substituteTeacher: s.substituteStaff.user.name,
      reason: s.remarks || "Substitution",
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 4. Today's periods for logged-in staff                              */
/* ------------------------------------------------------------------ */

export async function getMyTodayPeriods(userId) {
  const staff = await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();

  const today = businessNow();
  const todayName = weekdayOf(today);

  const [periods, entries, substitutions, dateEntries] = await Promise.all([
    prisma.period.findMany({
      where: { academicYearId: year.id, weekday: todayName },
      orderBy: { periodIndex: "asc" },
    }),
    prisma.timetableEntry.findMany({
      where: {
        academicYearId: year.id,
        weekday: todayName,
        subject: {
          allocations: {
            some: { staffAssignments: { some: { staffId: staff.id } } },
          },
        },
      },
      include: { subject: true, standard: true, period: true },
    }),
    prisma.periodSubstitution.findMany({
      where: {
        substituteStaffId: staff.id,
        substitutionDate: today,
      },
      include: {
        period: true,
        standard: true,
        subject: true,
        originalStaff: { include: { user: true } },
      },
    }),
    prisma.dateSpecificTimetableEntry.findMany({
      where: {
        academicYearId: year.id,
        calendarDate: today,
        subject: {
          allocations: {
            some: { staffAssignments: { some: { staffId: staff.id } } },
          },
        },
      },
      include: { period: true, standard: true, subject: true },
    }),
  ]);

  const periodMap = periods.reduce((acc, p) => {
    acc[p.periodIndex] = p;
    return acc;
  }, {});

  const result = [];

  for (const entry of entries) {
    result.push({
      periodIndex: entry.period.periodIndex,
      startTime: entry.period.startTime,
      endTime: entry.period.endTime,
      classId: entry.standard.id,
      className: entry.standard.name,
      subject: entry.subject.name,
      type: "NORMAL",
      room: null,
      note: null,
    });
  }

  for (const sub of substitutions) {
    result.push({
      periodIndex: sub.period.periodIndex,
      startTime: sub.period.startTime,
      endTime: sub.period.endTime,
      classId: sub.standard.id,
      className: sub.standard.name,
      subject: sub.subject.name,
      type: "SUBSTITUTION",
      room: null,
      note: `Substituting ${sub.originalStaff.user.name}`,
    });
  }

  for (const d of dateEntries) {
    result.push({
      periodIndex: d.period.periodIndex,
      startTime: d.period.startTime,
      endTime: d.period.endTime,
      classId: d.standard.id,
      className: d.standard.name,
      subject: d.subject.name,
      type: "DATE_SPECIFIC",
      room: null,
      note: "Date-specific timetable",
    });
  }

  result.sort((a, b) => a.periodIndex - b.periodIndex);

  return {
    date: todayKey(today),
    weekday: todayName,
    weekdayLabel: WEEKDAY_LABELS[todayName],
    periods: result,
  };
}