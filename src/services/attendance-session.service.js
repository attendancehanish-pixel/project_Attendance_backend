// import prisma from '../lib/prisma.js';
// import { ApiError } from '../utils/api-error.js';
// import { startOfDay, endOfDay, parseSchoolDate, todayKey, weekdayOf, businessNow } from '../utils/date.js';

// const WEEKDAYS = [
//   'SUNDAY',
//   'MONDAY',
//   'TUESDAY',
//   'WEDNESDAY',
//   'THURSDAY',
//   'FRIDAY',
//   'SATURDAY',
// ];

// const dateKey = (date) => startOfDay(date).toISOString().slice(0, 10);
// const weekdayOfSchool = (date) => weekdayOf(date);

// // Generates PENDING AttendanceSession rows for every timetable slot on a
// // single date, so that "has this been marked?" becomes a plain DB lookup
// // instead of something recomputed from the timetable every time.
// //
// // Idempotent: already-generated sessions (same date+period+standard) are
// // left untouched, so calling this repeatedly (e.g. a weekly cron / an admin
// // button) never duplicates or overwrites existing sessions.
// export const generateForDate = async (academicYearId, dateInput) => {
//   if (!dateInput) throw new ApiError(400, 'date is required in YYYY-MM-DD format');

//   const date = startOfDay(new Date(`${String(dateInput).slice(0, 10)}T00:00:00`));
//   if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Invalid date');

//   const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
//   if (!year) throw new ApiError(404, 'Academic year not found');

//   if (date < startOfDay(year.startDate) || date > endOfDay(year.endDate)) {
//     return { date: dateKey(date), created: 0, skipped: 0, reason: 'OUTSIDE_ACADEMIC_YEAR' };
//   }

//   const weekday = weekdayOfSchool(date);

//   const [override, weeklyHoliday] = await Promise.all([
//     prisma.calendarOverride.findUnique({
//       where: { academicYearId_calendarDate: { academicYearId, calendarDate: date } },
//     }),
//     prisma.weeklyHoliday.findUnique({
//       where: { academicYearId_weekday: { academicYearId, weekday } },
//     }),
//   ]);

//   // An explicit HOLIDAY override always wins. Otherwise a weekly off day is
//   // a holiday unless this specific date has been marked a WORKING_DAY.
//   if (override?.type === 'HOLIDAY') {
//     return { date: dateKey(date), created: 0, skipped: 0, reason: 'CALENDAR_HOLIDAY' };
//   }
//   if (weeklyHoliday && override?.type !== 'WORKING_DAY') {
//     return { date: dateKey(date), created: 0, skipped: 0, reason: 'WEEKLY_HOLIDAY' };
//   }

//   // Date-specific timetable entries override the normal weekly timetable,
//   // one period at a time (mirrors the logic in attendance.current.service.js).
//   const [dateSpecificEntries, normalEntries] = await Promise.all([
//     prisma.dateSpecificTimetableEntry.findMany({
//       where: { academicYearId, calendarDate: date, attendanceRequired: true },
//     }),
//     prisma.timetableEntry.findMany({
//       where: { academicYearId, weekday, attendanceRequired: true },
//     }),
//   ]);

//   const overriddenPeriodIds = new Set(dateSpecificEntries.map((e) => e.periodId));
//   const entries = [
//     ...dateSpecificEntries.map((e) => ({ ...e, source: 'DATE_SPECIFIC_TIMETABLE' })),
//     ...normalEntries
//       .filter((e) => !overriddenPeriodIds.has(e.periodId))
//       .map((e) => ({ ...e, source: 'NORMAL_TIMETABLE' })),
//   ];

//   let created = 0;
//   let skipped = 0;

//   for (const entry of entries) {
//     const assignment = await prisma.staffSubjectAssignment.findFirst({
//       where: {
//         subjectAllocation: {
//           is: { academicYearId, standardId: entry.standardId, subjectId: entry.subjectId },
//         },
//       },
//       orderBy: { id: 'asc' },
//     });

//     if (!assignment) {
//       skipped++;
//       continue;
//     }

//     // A substitute for this exact date/period/standard takes over marking.
//     const substitution = await prisma.periodSubstitution.findUnique({
//       where: {
//         substitutionDate_periodId_standardId: {
//           substitutionDate: date,
//           periodId: entry.periodId,
//           standardId: entry.standardId,
//         },
//       },
//     });

//     try {
//       await prisma.attendanceSession.create({
//         data: {
//           academicYearId,
//           attendanceDate: date,
//           periodId: entry.periodId,
//           standardId: entry.standardId,
//           subjectId: entry.subjectId,
//           staffId: substitution ? substitution.substituteStaffId : assignment.staffId,
//           sessionStatus: 'PENDING',
//           source: entry.source,
//           timetableEntryId: entry.source === 'NORMAL_TIMETABLE' ? entry.id : null,
//           dateTimetableEntryId: entry.source === 'DATE_SPECIFIC_TIMETABLE' ? entry.id : null,
//         },
//       });
//       created++;
//     } catch (e) {
//       // Unique constraint -> a session for this date/period/standard already
//       // exists (generated earlier, or created lazily via /attendance/current).
//       if (e?.code === 'P2002') {
//         skipped++;
//         continue;
//       }
//       throw e;
//     }
//   }

//   return { date: dateKey(date), created, skipped };
// };

// const MAX_RANGE_DAYS = 31;

// // Generates sessions for every date in [from, to] (inclusive). Used by the
// // admin "generate next week" action so that unmarked sessions exist as real
// // rows ahead of time and can be queried directly, instead of being
// // reconstructed from the timetable on every report run.
// export const generateForDateRange = async (academicYearId, { from, to }) => {
//   if (!from || !to) throw new ApiError(400, 'from and to are required (YYYY-MM-DD)');

//   const start = startOfDay(new Date(`${String(from).slice(0, 10)}T00:00:00`));
//   const end = startOfDay(new Date(`${String(to).slice(0, 10)}T00:00:00`));
//   if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
//     throw new ApiError(400, 'Invalid from/to date');
//   }
//   if (end < start) throw new ApiError(400, '"to" must be on or after "from"');

//   const dayCount = Math.round((end - start) / 86400000) + 1;
//   if (dayCount > MAX_RANGE_DAYS) {
//     throw new ApiError(400, `Range too large; generate at most ${MAX_RANGE_DAYS} days at a time`);
//   }

//   const days = [];
//   let totalCreated = 0;
//   let totalSkipped = 0;

//   for (let i = 0; i < dayCount; i++) {
//     const d = new Date(start);
//     d.setDate(d.getDate() + i);
//     const result = await generateForDate(academicYearId, dateKey(d));
//     days.push(result);
//     totalCreated += result.created;
//     totalSkipped += result.skipped;
//   }

//   return {
//     from: dateKey(start),
//     to: dateKey(end),
//     totals: { created: totalCreated, skipped: totalSkipped },
//     days,
//   };
// };

// // Convenience wrapper for the common "generate the next N days" action.
// export const generateForNextDays = async (academicYearId, days = 7) => {
//   const count = Number(days);
//   if (!Number.isInteger(count) || count < 1 || count > MAX_RANGE_DAYS) {
//     throw new ApiError(400, `days must be an integer between 1 and ${MAX_RANGE_DAYS}`);
//   }

//   const start = startOfDay(businessNow());
//   const end = new Date(start);
//   end.setDate(end.getDate() + (count - 1));

//   return generateForDateRange(academicYearId, { from: dateKey(start), to: dateKey(end) });
// };

// export default { generateForDate, generateForDateRange, generateForNextDays };




import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { startOfDay, endOfDay, parseSchoolDate, todayKey, weekdayOf, businessNow, addDays, parseSchoolDateStrict } from '../utils/date.js';

const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const MAX_RANGE_DAYS = 31;

const dateKey = (date) => {
  return todayKey(date);
};

const parseDate = (value, field = 'date') => {
  if (!value) {
    throw new ApiError(
      400,
      `${field} is required in YYYY-MM-DD format`
    );
  }

  const raw = String(value).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ApiError(400, `Invalid ${field}`);
  }

  try {
    const date = parseSchoolDate(raw);
    if (todayKey(date) !== raw) throw new Error('invalid');
    return date;
  } catch {
    throw new ApiError(400, `Invalid ${field}`);
  }
};

const weekdayOfSchool = (date) => weekdayOf(date);

const periodIndexFor = (periods, periodId) => {
  const period = periods.find((p) => p.id === periodId);
  return period?.periodIndex ?? null;
};

/**
 * Returns the active attendance exception that blocks a particular date/period.
 * PERIOD_RANGE supports ranges such as Monday P3 -> Wednesday P2.
 */
const getDatePeriodException = (date, periodIndex, exceptions) => {
  for (const exception of exceptions) {
    if (exception.scope === 'FULL_DAY') return exception;

    if (exception.scope !== 'PERIOD_RANGE') continue;

    const startDate = startOfDay(exception.startDate);
    const endDate = startOfDay(exception.endDate);
    const current = startOfDay(date);
    const startIndex = exception.startPeriod?.periodIndex;
    const endIndex = exception.endPeriod?.periodIndex;

    if (startIndex == null || endIndex == null) continue;

    // Same date: startPeriod -> endPeriod.
    if (startDate.getTime() === endDate.getTime()) {
      if (periodIndex >= startIndex && periodIndex <= endIndex) return exception;
      continue;
    }

    // First date: startPeriod onwards.
    if (current.getTime() === startDate.getTime() && periodIndex >= startIndex) {
      return exception;
    }

    // Last date: beginning through endPeriod.
    if (current.getTime() === endDate.getTime() && periodIndex <= endIndex) {
      return exception;
    }

    // Dates strictly between start/end: all periods.
    if (current > startDate && current < endDate) return exception;
  }

  return null;
};

const getDateRules = async (academicYearId, date) => {
  const weekday = weekdayOfSchool(date);
  const [override, weeklyHoliday, exceptions] = await Promise.all([
    prisma.calendarOverride.findUnique({
      where: { academicYearId_calendarDate: { academicYearId, calendarDate: date } },
    }),
    prisma.weeklyHoliday.findUnique({
      where: { academicYearId_weekday: { academicYearId, weekday } },
    }),
    prisma.attendanceException.findMany({
      where: {
        academicYearId,
        isActive: true,
        startDate: { lte: endOfDay(date) },
        endDate: { gte: startOfDay(date) },
      },
      include: { category: true, startPeriod: true, endPeriod: true },
    }),
  ]);

  const fullDayException = exceptions.find((e) => e.scope === 'FULL_DAY') || null;

  if (override?.type === 'HOLIDAY') {
    return { weekday, override, weeklyHoliday, fullDayException, exceptions, blockedAllDay: true, reason: 'CALENDAR_HOLIDAY' };
  }

  if (fullDayException) {
    return {
      weekday,
      override,
      weeklyHoliday,
      fullDayException,
      exceptions,
      blockedAllDay: true,
      reason: 'ATTENDANCE_EXCEPTION',
    };
  }

  if (weeklyHoliday && override?.type !== 'WORKING_DAY') {
    return { weekday, override, weeklyHoliday, fullDayException, exceptions, blockedAllDay: true, reason: 'WEEKLY_HOLIDAY' };
  }

  return { weekday, override, weeklyHoliday, fullDayException, exceptions, blockedAllDay: false, reason: null };
};

const getTimetableEntriesForDate = async (academicYearId, date, weekday) => {
  const [dateSpecificEntries, normalEntries] = await Promise.all([
    prisma.dateSpecificTimetableEntry.findMany({
      where: { academicYearId, calendarDate: date, attendanceRequired: true },
      include: { period: true, standard: true, subject: true },
    }),
    prisma.timetableEntry.findMany({
      where: { academicYearId, weekday, attendanceRequired: true },
      include: { period: true, standard: true, subject: true },
    }),
  ]);

  // A date-specific entry overrides the normal timetable only for the same
  // class + period, not for every class using that period.
  const overriddenKeys = new Set(
    dateSpecificEntries.map((entry) => `${entry.standardId}:${entry.periodId}`)
  );

  return [
    ...dateSpecificEntries.map((entry) => ({ ...entry, source: 'DATE_SPECIFIC_TIMETABLE' })),
    ...normalEntries
      .filter((entry) => !overriddenKeys.has(`${entry.standardId}:${entry.periodId}`))
      .map((entry) => ({ ...entry, source: 'NORMAL_TIMETABLE' })),
  ];
};

const getAssignment = async (academicYearId, entry) =>
  prisma.staffSubjectAssignment.findFirst({
    where: {
      subjectAllocation: {
        is: {
          academicYearId,
          standardId: entry.standardId,
          subjectId: entry.subjectId,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

const getSubstitution = async (date, entry) =>
  prisma.periodSubstitution.findUnique({
    where: {
      substitutionDate_periodId_standardId: {
        substitutionDate: date,
        periodId: entry.periodId,
        standardId: entry.standardId,
      },
    },
  });

const getStaffLeaveForSession = async (staffId, academicYearId, date, periodId) => {
  const leaves = await prisma.staffLeave.findMany({
    where: {
      staffId,
      academicYearId,
      status: 'APPROVED',
      startDate: { lte: endOfDay(date) },
      endDate: { gte: startOfDay(date) },
    },
    include: { periodLeaves: true },
  });

  for (const leave of leaves) {
    // No period rows means the leave covers the whole day.
    if (leave.periodLeaves.length === 0) return leave;

    if (leave.periodLeaves.some((periodLeave) => periodLeave.periodId === periodId)) {
      return leave;
    }
  }

  return null;
};

const createSessionForEntry = async ({ academicYearId, date, entry }) => {
  const assignment = await getAssignment(academicYearId, entry);
  if (!assignment) {
    return { created: false, skipped: true, reason: 'NO_STAFF_ASSIGNMENT' };
  }

  const substitution = await getSubstitution(date, entry);
  const originalStaffId = assignment.staffId;
  const effectiveStaffId = substitution?.substituteStaffId || originalStaffId;

  // A valid substitution means the substitute is the effective staff member;
  // the original staff's leave must not turn that session into STAFF_LEAVE.
  const staffLeave = substitution
    ? null
    : await getStaffLeaveForSession(originalStaffId, academicYearId, date, entry.periodId);

  const sessionStatus = staffLeave ? 'STAFF_LEAVE' : 'PENDING';

  try {
    await prisma.attendanceSession.create({
      data: {
        academicYearId,
        attendanceDate: date,
        periodId: entry.periodId,
        standardId: entry.standardId,
        subjectId: entry.subjectId,
        staffId: effectiveStaffId,
        sessionStatus,
        source: entry.source,
        timetableEntryId: entry.source === 'NORMAL_TIMETABLE' ? entry.id : null,
        dateTimetableEntryId: entry.source === 'DATE_SPECIFIC_TIMETABLE' ? entry.id : null,
      },
    });

    return {
      created: true,
      skipped: false,
      reason: sessionStatus === 'STAFF_LEAVE' ? 'STAFF_LEAVE' : null,
    };
  } catch (error) {
    if (error?.code === 'P2002') {
      return { created: false, skipped: true, reason: 'ALREADY_EXISTS' };
    }
    throw error;
  }
};

export const generateForDate = async (academicYearId, dateInput) => {
  const date = parseDate(dateInput);
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new ApiError(404, 'Academic year not found');

  if (date < startOfDay(year.startDate) || date > endOfDay(year.endDate)) {
    return { date: dateKey(date), created: 0, skipped: 0, staffLeave: 0, reason: 'OUTSIDE_ACADEMIC_YEAR' };
  }

  const rules = await getDateRules(academicYearId, date);
  if (rules.blockedAllDay) {
    return {
      date: dateKey(date),
      created: 0,
      skipped: 0,
      staffLeave: 0,
      reason: rules.reason,
    };
  }

  const entries = await getTimetableEntriesForDate(academicYearId, date, rules.weekday);
  const periods = await prisma.period.findMany({
    where: { academicYearId },
    select: { id: true, periodIndex: true },
  });
  const periodIndexMap = new Map(periods.map((p) => [p.id, p.periodIndex]));

  let created = 0;
  let skipped = 0;
  let staffLeave = 0;
  let exceptionSkipped = 0;

  for (const entry of entries) {
    const periodIndex = periodIndexMap.get(entry.periodId);
    if (periodIndex == null) {
      skipped++;
      continue;
    }

    const exception = getDatePeriodException(date, periodIndex, rules.exceptions);
    if (exception) {
      exceptionSkipped++;
      continue;
    }

    const result = await createSessionForEntry({ academicYearId, date, entry });
    if (result.created) {
      created++;
      if (result.reason === 'STAFF_LEAVE') staffLeave++;
    } else {
      skipped++;
    }
  }

  return {
    date: dateKey(date),
    created,
    skipped,
    staffLeave,
    exceptionSkipped,
    reason: null,
  };
};

export const generateForDateRange = async (academicYearId, { from, to }) => {
  if (!from || !to) throw new ApiError(400, 'from and to are required (YYYY-MM-DD)');

  const start = parseDate(from, 'from');
  const end = parseDate(to, 'to');
  if (end < start) throw new ApiError(400, '"to" must be on or after "from"');

  const dayCount = Math.round((end - start) / 86400000) + 1;
  if (dayCount > MAX_RANGE_DAYS) {
    throw new ApiError(400, `Range too large; generate at most ${MAX_RANGE_DAYS} days at a time`);
  }

  const days = [];
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalStaffLeave = 0;
  let totalExceptionSkipped = 0;

  for (let i = 0; i < dayCount; i++) {
    const date = addDays(start, i);

    const result = await generateForDate(academicYearId, dateKey(date));
    days.push(result);
    totalCreated += result.created;
    totalSkipped += result.skipped;
    totalStaffLeave += result.staffLeave;
    totalExceptionSkipped += result.exceptionSkipped;
  }

  return {
    from: dateKey(start),
    to: dateKey(end),
    totals: {
      created: totalCreated,
      skipped: totalSkipped,
      staffLeave: totalStaffLeave,
      exceptionSkipped: totalExceptionSkipped,
    },
    days,
  };
};

export const generateForNextDays = async (academicYearId, days = 7) => {
  const count = Number(days);
  if (!Number.isInteger(count) || count < 1 || count > MAX_RANGE_DAYS) {
    throw new ApiError(400, `days must be an integer between 1 and ${MAX_RANGE_DAYS}`);
  }

  const start = startOfDay(businessNow());
  const end = addDays(start, count - 1);

  return generateForDateRange(academicYearId, {
    from: dateKey(start),
    to: dateKey(end),
  });
};

const MAX_LIST_RANGE_DAYS = 92;

const parseListDate = (value, field) => {
  if (!value) throw new ApiError(400, `${field} is required (YYYY-MM-DD)`);
  return parseSchoolDateStrict(value, field);
};

/**
 * Returns sessions for an academic year within [from, to], grouped as
 *   [{ date, totals, classes: [{ standardId, standardCode, standardName,
 *       totals, periods: [{ periodId, periodIndex, startTime, endTime,
 *       subjectId, subjectCode, subjectName, staffId, staffName,
 *       employeeCode, sessionStatus, source, sessionId, markedCount }] }] }]
 *
 * Filters (all optional):
 *   - from, to        : date range (defaults to today → today+6)
 *   - standardId      : restrict to one class
 *   - staffId         : restrict to one staff member
 *   - status          : PENDING | MARKED | STAFF_LEAVE | ...
 *   - source          : NORMAL_TIMETABLE | DATE_SPECIFIC_TIMETABLE
 */
export const listSessionsGrouped = async (academicYearId, filters = {}) => {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new ApiError(404, 'Academic year not found');

  const today = startOfDay(businessNow());
  const defaultTo = addDays(today, 6);

  const from = filters.from ? parseListDate(filters.from, 'from') : today;
  const to = filters.to ? parseListDate(filters.to, 'to') : defaultTo;

  if (to < from) throw new ApiError(400, '"to" must be on or after "from"');

  const dayCount = Math.round((to - from) / 86400000) + 1;
  if (dayCount > MAX_LIST_RANGE_DAYS) {
    throw new ApiError(400, `Range too large; list at most ${MAX_LIST_RANGE_DAYS} days at a time`);
  }

  const where = {
    academicYearId,
    attendanceDate: { gte: from, lte: endOfDay(to) },
  };
  if (filters.standardId) where.standardId = filters.standardId;
  if (filters.staffId) where.staffId = filters.staffId;
  if (filters.status) where.sessionStatus = filters.status;
  if (filters.source) where.source = filters.source;

  const sessions = await prisma.attendanceSession.findMany({
    where,
    orderBy: [
      { attendanceDate: 'asc' },
      { standard: { code: 'asc' } },
      { period: { periodIndex: 'asc' } },
    ],
    include: {
      standard: { select: { id: true, code: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
      staff: {
        select: {
          id: true,
          employeeCode: true,
          user: { select: { name: true } },
        },
      },
      period: {
        select: { id: true, periodIndex: true, startTime: true, endTime: true, weekday: true },
      },
      _count: { select: { records: true } },
    },
  });

  // Group: date -> class -> period
  const byDate = new Map();

  for (const s of sessions) {
    const dKey = dateKey(s.attendanceDate);

    if (!byDate.has(dKey)) {
      byDate.set(dKey, {
        date: dKey,
        totals: { sessions: 0, pending: 0, marked: 0, staffLeave: 0 },
        classes: new Map(),
      });
    }
    const day = byDate.get(dKey);

    if (!day.classes.has(s.standardId)) {
      day.classes.set(s.standardId, {
        standardId: s.standard.id,
        standardCode: s.standard.code,
        standardName: s.standard.name,
        totals: { sessions: 0, pending: 0, marked: 0, staffLeave: 0 },
        periods: [],
      });
    }
    const cls = day.classes.get(s.standardId);

    const markedCount = s._count?.records ?? 0;
    const isMarked = markedCount > 0 || s.sessionStatus === 'MARKED';
    const isStaffLeave = s.sessionStatus === 'STAFF_LEAVE';

    const periodRow = {
      sessionId: s.id,
      periodId: s.period.id,
      periodIndex: s.period.periodIndex,
      startTime: s.period.startTime,
      endTime: s.period.endTime,
      weekday: s.period.weekday,
      subjectId: s.subject.id,
      subjectCode: s.subject.code,
      subjectName: s.subject.name,
      staffId: s.staff.id,
      staffName: s.staff.user?.name ?? null,
      employeeCode: s.staff.employeeCode,
      sessionStatus: s.sessionStatus,
      source: s.source,
      markedCount,
    };

    cls.periods.push(periodRow);

    // Roll up
    for (const bucket of [day.totals, cls.totals]) {
      bucket.sessions += 1;
      if (isStaffLeave) bucket.staffLeave += 1;
      else if (isMarked) bucket.marked += 1;
      else bucket.pending += 1;
    }
  }

  // Convert Maps → arrays, sort
  const result = [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((day) => ({
      ...day,
      classes: [...day.classes.values()]
        .sort((a, b) => a.standardCode.localeCompare(b.standardCode))
        .map((cls) => ({
          ...cls,
          periods: cls.periods.sort((a, b) => a.periodIndex - b.periodIndex),
        })),
    }));

  return {
    from: dateKey(from),
    to: dateKey(to),
    totals: result.reduce(
      (acc, d) => ({
        sessions: acc.sessions + d.totals.sessions,
        pending: acc.pending + d.totals.pending,
        marked: acc.marked + d.totals.marked,
        staffLeave: acc.staffLeave + d.totals.staffLeave,
      }),
      { sessions: 0, pending: 0, marked: 0, staffLeave: 0 }
    ),
    days: result,
  };
};
export default {
  generateForDate,
  generateForDateRange,
  generateForNextDays,
};


