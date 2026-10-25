import {
  weekdayOf,
  businessNow,
  todayKey,
  startOfDay,
  endOfDay,
  parseSchoolDateStrict,
} from '../utils/date.js';
import prisma from '../lib/prisma.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// Display order of the week. Sunday is last, but it IS supported: the admin
// timetable can schedule any of the seven days and staff must see all of them.
const WEEK_ORDER = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

const DEFAULT_WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

const WEEKDAY_LABELS = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

/**
 * Picks the academic year staff should see.
 *
 * Admins often build the timetable in a year that is not (yet) flagged ACTIVE.
 * Requiring ACTIVE made the whole staff timetable fail with "No active
 * academic year found". Order of preference:
 *   1. the ACTIVE year
 *   2. the year whose dates contain today
 *   3. the most recent year that has timetable entries
 *   4. the most recent year
 */
async function getActiveAcademicYear() {
  const active = await prisma.academicYear.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startDate: 'desc' },
  });
  if (active) return active;

  const now = businessNow();
  const current = await prisma.academicYear.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now }, status: { not: 'COMPLETED' } },
    orderBy: { startDate: 'desc' },
  });
  if (current) return current;

  const withTimetable = await prisma.academicYear.findFirst({
    where: { timetableEntries: { some: {} } },
    orderBy: { startDate: 'desc' },
  });
  if (withTimetable) return withTimetable;

  const latest = await prisma.academicYear.findFirst({ orderBy: { startDate: 'desc' } });
  if (latest) return latest;

  throw new Error('No active academic year found');
}

async function getStaffByUserId(userId) {
  const staff = await prisma.staff.findUnique({
    where: { userId },
    include: { user: true },
  });

  if (!staff) {
    throw new Error('Staff profile not found');
  }

  return staff;
}

/**
 * The exact (standard, subject) pairs a staff member teaches in a year.
 * Matching on subject alone was wrong: a teacher of "Maths" in Class 5 would
 * also be shown every other class's Maths period.
 */
async function getStaffTeachingPairs(staffId, academicYearId) {
  const assignments = await prisma.staffSubjectAssignment.findMany({
    where: { staffId, subjectAllocation: { academicYearId } },
    select: { subjectAllocation: { select: { standardId: true, subjectId: true } } },
  });

  const seen = new Set();
  const pairs = [];
  for (const a of assignments) {
    const { standardId, subjectId } = a.subjectAllocation;
    const key = `${standardId}:${subjectId}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ standardId, subjectId });
    }
  }
  return pairs;
}

const pairsFilter = (pairs) => ({ OR: pairs.map((p) => ({ standardId: p.standardId, subjectId: p.subjectId })) });

/**
 * Weekdays to show as grid columns, in week order.
 *  - every weekday that has periods configured, minus weekly holidays
 *  - plus any weekday that actually has an entry (even on a holiday)
 *  - falls back to Monday-Friday when nothing is configured yet
 */
function resolveWeekdays({ periods, weeklyHolidays = [], entryWeekdays = [] }) {
  const holidays = new Set(weeklyHolidays);
  const days = new Set();

  for (const p of periods) {
    if (p.weekday && !holidays.has(p.weekday)) days.add(p.weekday);
  }
  for (const d of entryWeekdays) days.add(d);

  const ordered = WEEK_ORDER.filter((d) => days.has(d));
  return ordered.length ? ordered : DEFAULT_WEEKDAYS;
}

/**
 * Builds the unique list of grid rows (by periodIndex). Times differ per
 * weekday, so each row also carries `times` keyed by weekday.
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
        times: {},
      });
    }
    if (p.weekday) {
      byIndex.get(p.periodIndex).times[p.weekday] = {
        startTime: p.startTime,
        endTime: p.endTime,
      };
    }
  }

  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
}

/** Puts a cell into timetable[weekday][periodIndex]; merges clashes instead of overwriting. */
function placeCell(timetable, weekday, periodIndex, cell) {
  const day = (timetable[weekday] ||= {});
  const existing = day[periodIndex];

  if (!existing) {
    day[periodIndex] = cell;
    return;
  }

  // Same teacher, same period, two classes (e.g. combined class): show both.
  existing.className = [existing.className, cell.className].filter(Boolean).join(', ');
  if (existing.subject !== cell.subject) {
    existing.subject = `${existing.subject} / ${cell.subject}`;
  }
  existing.merged = true;
}

/* ------------------------------------------------------------------ */
/* 1. My Timetable (weekly grid of the logged-in staff)                */
/* ------------------------------------------------------------------ */

export async function getMyWeeklyTimetable(userId) {
  const staff = await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();
  const pairs = await getStaffTeachingPairs(staff.id, year.id);

  const [periods, weeklyHolidays, entries, substitutions, dateEntries] = await Promise.all([
    prisma.period.findMany({
      where: { academicYearId: year.id },
      orderBy: [{ weekday: 'asc' }, { periodIndex: 'asc' }],
    }),

    prisma.weeklyHoliday.findMany({
      where: { academicYearId: year.id },
      select: { weekday: true },
    }),

    pairs.length
      ? prisma.timetableEntry.findMany({
          where: { academicYearId: year.id, ...pairsFilter(pairs) },
          include: { subject: true, standard: true, period: true },
        })
      : [],

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
      orderBy: { substitutionDate: 'asc' },
    }),

    pairs.length
      ? prisma.dateSpecificTimetableEntry.findMany({
          where: { academicYearId: year.id, ...pairsFilter(pairs) },
          include: { period: true, standard: true, subject: true },
          orderBy: { calendarDate: 'asc' },
        })
      : [],
  ]);

  const weekdays = resolveWeekdays({
    periods,
    weeklyHolidays: weeklyHolidays.map((h) => h.weekday),
    entryWeekdays: entries.map((e) => e.weekday),
  });

  // Shape the normal timetable
  const timetable = {};
  for (const weekday of weekdays) timetable[weekday] = {};

  for (const entry of entries) {
    placeCell(timetable, entry.weekday, entry.period.periodIndex, {
      periodId: entry.periodId,
      classId: entry.standard.id,
      className: entry.standard.name,
      subject: entry.subject.name,
      subjectId: entry.subject.id,
      startTime: entry.period.startTime,
      endTime: entry.period.endTime,
      attendanceRequired: entry.attendanceRequired,
      room: null, // schema has no room on TimetableEntry; add later
      teacher: staff.user.name,
    });
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

  const todayName = weekdayOf(businessNow());
  const todayCount = Object.keys(timetable[todayName] || {}).length;

  return {
    staff: {
      id: staff.id,
      name: staff.user.name,
      employeeCode: staff.employeeCode,
    },
    academicYear: { id: year.id, name: year.name, status: year.status },
    weekdays,
    weekdayLabels: WEEKDAY_LABELS,
    today: todayName,
    // Lets the UI explain an empty grid ("no subjects assigned to you yet").
    hasAssignments: pairs.length > 0,
    hasPeriods: periods.length > 0,
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

/* ------------------------------------------------------------------ */
/* 2. Class Timetable (complete normal timetable for one class)        */
/* ------------------------------------------------------------------ */

export async function getClassTimetable(standardId) {
  const year = await getActiveAcademicYear();

  const standard = await prisma.standard.findUnique({
    where: { id: standardId },
  });

  if (!standard) {
    throw new Error('Class not found');
  }

  const [periods, weeklyHolidays, entries, staffAssignments] = await Promise.all([
    prisma.period.findMany({
      where: { academicYearId: year.id },
      orderBy: [{ weekday: 'asc' }, { periodIndex: 'asc' }],
    }),
    prisma.weeklyHoliday.findMany({
      where: { academicYearId: year.id },
      select: { weekday: true },
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

  // Map subjectId -> teacher names for this class
  const teachersBySubject = {};
  for (const sa of staffAssignments) {
    const id = sa.subjectAllocation.subjectId;
    (teachersBySubject[id] ||= []).push(sa.staff.user.name);
  }

  const weekdays = resolveWeekdays({
    periods,
    weeklyHolidays: weeklyHolidays.map((h) => h.weekday),
    entryWeekdays: entries.map((e) => e.weekday),
  });

  const timetable = {};
  for (const weekday of weekdays) timetable[weekday] = {};

  for (const entry of entries) {
    (timetable[entry.weekday] ||= {})[entry.period.periodIndex] = {
      periodId: entry.periodId,
      subject: entry.subject.name,
      subjectId: entry.subjectId,
      teacher: (teachersBySubject[entry.subjectId] || []).join(', ') || null,
      startTime: entry.period.startTime,
      endTime: entry.period.endTime,
      attendanceRequired: entry.attendanceRequired,
      room: null,
    };
  }

  return {
    standard: { id: standard.id, code: standard.code, name: standard.name },
    academicYear: { id: year.id, name: year.name, status: year.status },
    weekdays,
    weekdayLabels: WEEKDAY_LABELS,
    today: weekdayOf(businessNow()),
    periods: buildPeriodList(periods),
    timetable,
  };
}

export async function getClassList() {
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
        ...(Object.keys(dateFilter).length ? { calendarDate: dateFilter } : {}),
      },
      include: { period: true, standard: true, subject: true },
      orderBy: { calendarDate: 'asc' },
    }),

    prisma.periodSubstitution.findMany({
      where: {
        ...(Object.keys(dateFilter).length ? { substitutionDate: dateFilter } : {}),
        ...(standardId ? { standardId } : {}),
      },
      include: {
        period: true,
        standard: true,
        subject: true,
        originalStaff: { include: { user: true } },
        substituteStaff: { include: { user: true } },
      },
      orderBy: { substitutionDate: 'asc' },
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
      reason: 'Date-specific timetable override',
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
      reason: s.remarks || 'Substitution',
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 4. Today's periods for logged-in staff                              */
/* ------------------------------------------------------------------ */

export async function getMyTodayPeriods(userId) {
  const staff = await getStaffByUserId(userId);
  const year = await getActiveAcademicYear();
  const pairs = await getStaffTeachingPairs(staff.id, year.id);

  const now = businessNow();
  const todayName = weekdayOf(now);
  // Date columns hold school-local midnight, so compare against that - not
  // against "now", which never equals a stored midnight.
  const todayStart = startOfDay(now);

  const [entries, substitutions, dateEntries] = await Promise.all([
    pairs.length
      ? prisma.timetableEntry.findMany({
          where: { academicYearId: year.id, weekday: todayName, ...pairsFilter(pairs) },
          include: { subject: true, standard: true, period: true },
        })
      : [],
    prisma.periodSubstitution.findMany({
      where: { substituteStaffId: staff.id, substitutionDate: todayStart },
      include: {
        period: true,
        standard: true,
        subject: true,
        originalStaff: { include: { user: true } },
      },
    }),
    pairs.length
      ? prisma.dateSpecificTimetableEntry.findMany({
          where: { academicYearId: year.id, calendarDate: todayStart, ...pairsFilter(pairs) },
          include: { period: true, standard: true, subject: true },
        })
      : [],
  ]);

  // A date-specific entry replaces the normal entry for the same class + period.
  const overridden = new Set(dateEntries.map((d) => `${d.standardId}:${d.periodId}`));

  const result = [];

  for (const entry of entries) {
    if (overridden.has(`${entry.standardId}:${entry.periodId}`)) continue;
    result.push({
      periodIndex: entry.period.periodIndex,
      startTime: entry.period.startTime,
      endTime: entry.period.endTime,
      classId: entry.standard.id,
      className: entry.standard.name,
      subject: entry.subject.name,
      type: 'NORMAL',
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
      type: 'SUBSTITUTION',
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
      type: 'DATE_SPECIFIC',
      room: null,
      note: 'Date-specific timetable',
    });
  }

  result.sort((a, b) => a.periodIndex - b.periodIndex);

  return {
    date: todayKey(now),
    weekday: todayName,
    weekdayLabel: WEEKDAY_LABELS[todayName],
    periods: result,
  };
}
