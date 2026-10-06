// import prisma from '../lib/prisma.js';
// import { ApiError } from '../utils/api-error.js';
// import { startOfDay, endOfDay, businessNow, schoolParts, weekdayOf } from '../utils/date.js';

// const CLOSED_DAY_TYPES = new Set([
//   'HOLIDAY',
//   'CLOSED',
//   'NON_WORKING',
//   'NON_WORKING_DAY',
// ]);

// const SESSION_INCLUDE = {
//   standard: true,
//   subject: true,
//   period: true,
//   staff: true,
//   records: {
//     include: {
//       student: true,
//       absenceType: true,
//     },
//   },
// };

// const toMinutes = (time) => {
//   if (!time || typeof time !== 'string') return null;

//   const [hours, minutes] = time.split(':').map(Number);

//   if (
//     !Number.isInteger(hours) ||
//     !Number.isInteger(minutes) ||
//     hours < 0 ||
//     hours > 23 ||
//     minutes < 0 ||
//     minutes > 59
//   ) {
//     return null;
//   }

//   return hours * 60 + minutes;
// };

// const getCurrentMinutes = (date) =>
//   date.getHours() * 60 + date.getMinutes();

// const getWeekday = (date) => ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].indexOf(weekdayOf(date));

// const getWeekdayEnum = (date) => {
//   const values = [
//     'SUNDAY',
//     'MONDAY',
//     'TUESDAY',
//     'WEDNESDAY',
//     'THURSDAY',
//     'FRIDAY',
//     'SATURDAY',
//   ];

//   return values[getWeekday(date)];
// };

// const isDateInRange = (date, start, end) =>
//   date >= startOfDay(start) && date <= endOfDay(end);

// /**
//  * Finds the period containing the server's current local time.
//  *
//  * We intentionally load the periods for the active academic year and compare
//  * their configured HH:mm values in application code. This keeps the period
//  * definition independent from the database engine.
//  */
// export const findCurrentPeriod = async ({ academicYearId, now }) => {
//     const periods = await prisma.period.findMany({
//     where: {
//       academicYearId,
//       weekday: getWeekdayEnum(now),   // ✅ Only get today's periods
//     },
//     orderBy: { periodIndex: 'asc' },
//   });

//   const currentMinutes = getCurrentMinutes(now);

//   return (
//     periods.find((period) => {
//       const start = toMinutes(period.startTime);
//       const end = toMinutes(period.endTime);

//       if (start === null || end === null) return false;

//       return currentMinutes >= start && currentMinutes < end;
//     }) || null
//   );
// };

// const getActiveAcademicYear = async () => prisma.academicYear.findFirst();

// const isWorkingDay = async ({ academicYearId, date }) => {
//   // const calendarEntry = await prisma.academicCalendar.findUnique({
//   //   where: {
//   //     academicYearId_calendarDate: {
//   //       academicYearId,
//   //       calendarDate: startOfDay(date),
//   //     },
//   //   },
//   // });

//   // if (calendarEntry && CLOSED_DAY_TYPES.has(calendarEntry.dayType)) {
//   //   return {
//   //     working: false,
//   //     reason: 'HOLIDAY',
//   //     calendar: calendarEntry,
//   //   };
//   // }

//   // // WeeklyHoliday exists in the current schema. If your deployed schema does
//   // // not yet contain this model, remove this block until the migration is done.
//   // const weeklyHoliday = await prisma.weeklyHoliday.findUnique({
//   //   where: {
//   //     academicYearId_weekday: {
//   //       academicYearId,
//   //       weekday: getWeekdayEnum(date),
//   //     },
//   //   },
//   // });

//   // if (weeklyHoliday) {
//   //   return {
//   //     working: false,
//   //     reason: 'WEEKLY_HOLIDAY',
//   //     weeklyHoliday,
//   //   };
//   // }

//   return {
//     working: true,

//   };
// };

// const getStaff = async (userId) => {
//   const staff = await prisma.staff.findUnique({
//     where: { userId },
//   });

//   if (!staff) {
//     throw new ApiError(403, 'Authenticated user is not a staff member');
//   }

//   return staff;
// };

// const hasStaffFullDayLeave = async ({
//   staffId,
//   academicYearId,
//   date,
// }) => {
//   const leave = await prisma.staffLeave.findFirst({
//     where: {
//       staffId,
//       academicYearId,
//       status: 'APPROVED',
//       startDate: { lte: endOfDay(date) },
//       endDate: { gte: startOfDay(date) },
//     },
//     include: {
//       periodLeaves: true,
//     },
//   });

//   return leave && leave.periodLeaves.length === 0 ? leave : null;
// };

// const hasStaffPeriodLeave = async ({
//   staffId,
//   academicYearId,
//   date,
//   periodId,
// }) => {
//   const leave = await prisma.staffLeave.findFirst({
//     where: {
//       staffId,
//       academicYearId,
//       status: 'APPROVED',
//       startDate: { lte: endOfDay(date) },
//       endDate: { gte: startOfDay(date) },
//       periodLeaves: {
//         some: {
//           periodId,
//         },
//       },
//     },
//     include: {
//       periodLeaves: true,
//     },
//   });

//   return leave || null;
// };

// const getDateSpecificEntries = async ({
//   academicYearId,
//   date,
//   periodId,
// }) =>
//   prisma.dateSpecificTimetableEntry.findMany({
//     where: {
//       academicYearId,
//       calendarDate: startOfDay(date),
//       periodId,
//       attendanceRequired: true,
//     },
//     include: {
//       standard: true,
//       subject: true,
//       period: true,
//     },
//   });

// const getNormalEntries = async ({
//   academicYearId,
//   weekday,
//   periodId,
// }) =>
//   prisma.timetableEntry.findMany({
//     where: {
//       academicYearId,
//       weekday,
//       periodId,
//       attendanceRequired: true,
//     },
//     include: {
//       standard: true,
//       subject: true,
//       period: true,
//     },
//   });

// /**
//  * Checks whether the staff member is assigned to a class + subject.
//  *
//  * The current schema stores StaffSubjectAssignment.staffId as Staff.id.
//  */
// const hasSubjectAssignment = async ({
//   staffId,
//   academicYearId,
//   standardId,
//   subjectId,
// }) =>
//   prisma.staffSubjectAssignment.findFirst({
//     where: {
//       staffId,
//       subjectAllocation: {
//         is: {       
//           academicYearId,
//           standardId,
//           subjectId,
//         },
//       },
//     },
//     include: {
//       subjectAllocation: true,
//     },
//   });

// const getSubstitution = async ({
//   date,
//   periodId,
//   standardId,
//   subjectId,
// }) =>
//   prisma.periodSubstitution.findUnique({
//     where: {
//       substitutionDate_periodId_standardId: {
//         substitutionDate: startOfDay(date),
//         periodId,
//         standardId,
//       },
//     },
//   });

// const resolveCandidate = async ({
//   staffId,
//   academicYearId,
//   date,
//   period,
//   entry,
//   source,
// }) => {
//   const substitution = await getSubstitution({
//     date,
//     periodId: period.id,
//     standardId: entry.standardId,
//     subjectId: entry.subjectId,
//   });

//   if (substitution) {
//     if (substitution.substituteStaffId !== staffId) {
//       return null;
//     }

//     return {
//       ...entry,
//       source,
//       effectiveStaffId: staffId,
//       originalStaffId: substitution.originalStaffId,
//       substitutionId: substitution.id,
//       substitution,
//     };
//   }

//   const assignment = await hasSubjectAssignment({
//     staffId,
//     academicYearId,
//     standardId: entry.standardId,
//     subjectId: entry.subjectId,
//   });

//   if (!assignment) {
//     return null;
//   }

//   return {
//     ...entry,
//     source,
//     effectiveStaffId: staffId,
//     originalStaffId: staffId,
//     substitutionId: null,
//     substitution: null,
//   };
// };

// const resolveAssignments = async ({
//   staffId,
//   academicYearId,
//   date,
//   period,
// }) => {
//   const dateSpecificEntries = await getDateSpecificEntries({
//     academicYearId,
//     date,
//     periodId: period.id,
//   });

//   let entries = dateSpecificEntries;
//   let source = 'DATE_SPECIFIC_TIMETABLE';

//   // A date-specific timetable for the period takes precedence. Only if there
//   // is no override do we fall back to the weekly timetable.
//   if (entries.length === 0) {
//     entries = await getNormalEntries({
//       academicYearId,
//       weekday: getWeekdayEnum(date),   // returns 'SUNDAY', 'MONDAY'...
//       periodId: period.id,
//     });

//     source = 'NORMAL_TIMETABLE';
//   }

//   const candidates = [];

//   for (const entry of entries) {
//     const resolved = await resolveCandidate({
//       staffId,
//       academicYearId,
//       date,
//       period,
//       entry,
//       source,
//     });

//     if (resolved) {
//       candidates.push(resolved);
//     }
//   }

//   return candidates;
// };

// const getOrCreateSession = async ({
//   staffId,
//   academicYearId,
//   date,
//   period,
//   assignment,
// }) => {
//   const existing = await prisma.attendanceSession.findUnique({
//     where: {
//       attendanceDate_periodId_standardId: {
//         attendanceDate: startOfDay(date),
//         periodId: period.id,
//         standardId: assignment.standardId,
//       },
//     },
//     include: SESSION_INCLUDE,
//   });

//   if (existing) {
//     // If a session already exists, the database record is authoritative.
//     // A different staff member should not be silently returned as their
//     // attendance session.
//     if (existing.staffId !== staffId) {
//       throw new ApiError(
//         409,
//         'Attendance session already exists for this class and period'
//       );
//     }

//     return existing;
//   }

//   try {
//     return await prisma.attendanceSession.create({
//       data: {
//         academicYearId,
//         attendanceDate: startOfDay(date),
//         periodId: period.id,
//         standardId: assignment.standardId,
//         subjectId: assignment.subjectId,
//         staffId,
//         sessionStatus: 'PENDING',
//         source: assignment.source,
//         timetableEntryId:
//           assignment.source === 'NORMAL_TIMETABLE' ? assignment.id : null,
//         dateTimetableEntryId:
//           assignment.source === 'DATE_SPECIFIC_TIMETABLE' ? assignment.id : null,
//       },
//       include: SESSION_INCLUDE,
//     });
//   } catch (error) {
//     // Another request may have created the same session between our
//     // findUnique() and create(). Re-read the row after a unique conflict.
//     if (error?.code !== 'P2002') {
//       throw error;
//     }

//     const session = await prisma.attendanceSession.findUnique({
//       where: {
//         attendanceDate_periodId_standardId: {
//           attendanceDate: startOfDay(date),
//           periodId: period.id,
//           standardId: assignment.standardId,
//         },
//       },
//       include: SESSION_INCLUDE,
//     });

//     if (!session) throw error;

//     if (session.staffId !== staffId) {
//       throw new ApiError(
//         409,
//         'Attendance session already exists for this class and period'
//       );
//     }

//     return session;
//   }
// };

// /**
//  * Called when the staff opens the Attendance page.
//  *
//  * It answers:
//  * "What attendance session(s), if any, should this staff member mark right now?"
//  */
// export const getCurrentAttendance = async (userId) => {
//   const now = new Date();
//   const today = startOfDay(now);

//   const staff = await getStaff(userId);

//   const academicYear = await getActiveAcademicYear(today);

//   if (!academicYear) {
//     return {
//       available: false,
//       reason: 'NO_ACTIVE_ACADEMIC_YEAR',
//       serverTime: now,
//     };
//   }

//   const workingDay = await isWorkingDay({
//     academicYearId: academicYear.id,
//     date: today,
//   });

//   if (!workingDay.working) {
//     return {
//       available: false,
//       reason: workingDay.reason,
//       serverTime: now,
//       academicYear,
//     };
//   }

//   const period = await findCurrentPeriod({
//     academicYearId: academicYear.id,
//     now,
//   });

//   if (!period) {
//     return {
//       available: false,
//       reason: 'NO_CURRENT_PERIOD',
//       serverTime: now,
//       academicYear,
//     };
//   }

//   const fullDayLeave = await hasStaffFullDayLeave({
//     staffId: staff.id,
//     academicYearId: academicYear.id,
//     date: today,
//   });

//   if (fullDayLeave) {
//     return {
//       available: false,
//       reason: 'STAFF_ON_LEAVE',
//       serverTime: now,
//       academicYear,
//       period,
//     };
//   }

//   const periodLeave = await hasStaffPeriodLeave({
//     staffId: staff.id,
//     academicYearId: academicYear.id,
//     date: today,
//     periodId: period.id,
//   });

//   if (periodLeave) {
//     return {
//       available: false,
//       reason: 'STAFF_ON_PERIOD_LEAVE',
//       serverTime: now,
//       academicYear,
//       period,
//     };
//   }

//   const assignments = await resolveAssignments({
//     staffId: staff.id,
//     academicYearId: academicYear.id,
//     date: today,
//     period,
//   });

//   if (assignments.length === 0) {
//     return {
//       available: false,
//       reason: 'NO_ATTENDANCE_ASSIGNMENT',
//       serverTime: now,
//       academicYear,
//       period,
//     };
//   }

//   const sessions = [];

//   for (const assignment of assignments) {
//     const session = await getOrCreateSession({
//       staffId: staff.id,
//       academicYearId: academicYear.id,
//       date: today,
//       period,
//       assignment,
//     });

//     sessions.push(session);
//   }

//   return {
//     available: true,
//     multiple: sessions.length > 1,
//     serverTime: now,
//     academicYear,
//     period,
//     sessions,
//   };
// };


import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { startOfDay, endOfDay, businessNow, schoolParts, weekdayOf } from '../utils/date.js';

const CLOSED_DAY_TYPES = new Set([
  'HOLIDAY',
  'CLOSED',
  'NON_WORKING',
  'NON_WORKING_DAY',
]);

const SESSION_INCLUDE = {
  standard: true,
  subject: true,
  period: true,
  staff: true,
  records: {
    include: {
      
      absenceType: true,
    },
  },
};

const toMinutes = (time) => {
  if (!time || typeof time !== 'string') return null;

  const [hours, minutes] = time.split(':').map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

const getCurrentMinutes = (date) => {
  const p = schoolParts(date);
  return p.hour * 60 + p.minute;
};

const getWeekday = (date) => ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].indexOf(weekdayOf(date));

const getWeekdayEnum = (date) => {
  const values = [
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
  ];

  return values[getWeekday(date)];
};

const isDateInRange = (date, start, end) =>
  date >= startOfDay(start) && date <= endOfDay(end);

/**
 * Finds the period containing the server's current local time.
 *
 * We intentionally load the periods for the active academic year and compare
 * their configured HH:mm values in application code. This keeps the period
 * definition independent from the database engine.
 */
export const findCurrentPeriod = async ({ academicYearId, now }) => {
    const periods = await prisma.period.findMany({
    where: {
      academicYearId,
      weekday: getWeekdayEnum(now),   // ✅ Only get today's periods
    },
    orderBy: { periodIndex: 'asc' },
  });

  const currentMinutes = getCurrentMinutes(now);

  return (
    periods.find((period) => {
      const start = toMinutes(period.startTime);
      const end = toMinutes(period.endTime);

      if (start === null || end === null) return false;

      return currentMinutes >= start && currentMinutes < end;
    }) || null
  );
};

const getActiveAcademicYear = async () => prisma.academicYear.findFirst();

const isWorkingDay = async ({ academicYearId, date }) => {
  // const calendarEntry = await prisma.academicCalendar.findUnique({
  //   where: {
  //     academicYearId_calendarDate: {
  //       academicYearId,
  //       calendarDate: startOfDay(date),
  //     },
  //   },
  // });

  // if (calendarEntry && CLOSED_DAY_TYPES.has(calendarEntry.dayType)) {
  //   return {
  //     working: false,
  //     reason: 'HOLIDAY',
  //     calendar: calendarEntry,
  //   };
  // }

  // // WeeklyHoliday exists in the current schema. If your deployed schema does
  // // not yet contain this model, remove this block until the migration is done.
  // const weeklyHoliday = await prisma.weeklyHoliday.findUnique({
  //   where: {
  //     academicYearId_weekday: {
  //       academicYearId,
  //       weekday: getWeekdayEnum(date),
  //     },
  //   },
  // });

  // if (weeklyHoliday) {
  //   return {
  //     working: false,
  //     reason: 'WEEKLY_HOLIDAY',
  //     weeklyHoliday,
  //   };
  // }

  return {
    working: true,

  };
};

const getStaff = async (userId) => {
  const staff = await prisma.staff.findUnique({
    where: { userId },
  });

  if (!staff) {
    throw new ApiError(403, 'Authenticated user is not a staff member');
  }

  return staff;
};

const hasStaffFullDayLeave = async ({
  staffId,
  academicYearId,
  date,
}) => {
  const leave = await prisma.staffLeave.findFirst({
    where: {
      staffId,
      academicYearId,
      status: 'APPROVED',
      startDate: { lte: endOfDay(date) },
      endDate: { gte: startOfDay(date) },
    },
    include: {
      periodLeaves: true,
    },
  });

  return leave && leave.periodLeaves.length === 0 ? leave : null;
};

const hasStaffPeriodLeave = async ({
  staffId,
  academicYearId,
  date,
  periodId,
}) => {
  const leave = await prisma.staffLeave.findFirst({
    where: {
      staffId,
      academicYearId,
      status: 'APPROVED',
      startDate: { lte: endOfDay(date) },
      endDate: { gte: startOfDay(date) },
      periodLeaves: {
        some: {
          periodId,
        },
      },
    },
    include: {
      periodLeaves: true,
    },
  });

  return leave || null;
};

const getDateSpecificEntries = async ({
  academicYearId,
  date,
  periodId,
}) =>
  prisma.dateSpecificTimetableEntry.findMany({
    where: {
      academicYearId,
      calendarDate: startOfDay(date),
      periodId,
      attendanceRequired: true,
    },
    include: {
      standard: true,
      subject: true,
      period: true,
    },
  });

const getNormalEntries = async ({
  academicYearId,
  weekday,
  periodId,
}) =>
  prisma.timetableEntry.findMany({
    where: {
      academicYearId,
      weekday,
      periodId,
      attendanceRequired: true,
    },
    include: {
      standard: true,
      subject: true,
      period: true,
    },
  });

/**
 * Checks whether the staff member is assigned to a class + subject.
 *
 * The current schema stores StaffSubjectAssignment.staffId as Staff.id.
 */
const hasSubjectAssignment = async ({
  staffId,
  academicYearId,
  standardId,
  subjectId,
}) =>
  prisma.staffSubjectAssignment.findFirst({
    where: {
      staffId,
      subjectAllocation: {
        is: {       
          academicYearId,
          standardId,
          subjectId,
        },
      },
    },
    include: {
      subjectAllocation: true,
    },
  });

const getSubstitution = async ({
  date,
  periodId,
  standardId,
  subjectId,
}) =>
  prisma.periodSubstitution.findUnique({
    where: {
      substitutionDate_periodId_standardId: {
        substitutionDate: startOfDay(date),
        periodId,
        standardId,
      },
    },
  });

const resolveCandidate = async ({
  staffId,
  academicYearId,
  date,
  period,
  entry,
  source,
}) => {
  const substitution = await getSubstitution({
    date,
    periodId: period.id,
    standardId: entry.standardId,
    subjectId: entry.subjectId,
  });

  if (substitution) {
    if (substitution.substituteStaffId !== staffId) {
      return null;
    }

    return {
      ...entry,
      source,
      effectiveStaffId: staffId,
      originalStaffId: substitution.originalStaffId,
      substitutionId: substitution.id,
      substitution,
    };
  }

  const assignment = await hasSubjectAssignment({
    staffId,
    academicYearId,
    standardId: entry.standardId,
    subjectId: entry.subjectId,
  });

  if (!assignment) {
    return null;
  }

  return {
    ...entry,
    source,
    effectiveStaffId: staffId,
    originalStaffId: staffId,
    substitutionId: null,
    substitution: null,
  };
};

const resolveAssignments = async ({
  staffId,
  academicYearId,
  date,
  period,
}) => {
  const dateSpecificEntries = await getDateSpecificEntries({
    academicYearId,
    date,
    periodId: period.id,
  });

  let entries = dateSpecificEntries;
  let source = 'DATE_SPECIFIC_TIMETABLE';

  // A date-specific timetable for the period takes precedence. Only if there
  // is no override do we fall back to the weekly timetable.
  if (entries.length === 0) {
    entries = await getNormalEntries({
      academicYearId,
      weekday: getWeekdayEnum(date),   // returns 'SUNDAY', 'MONDAY'...
      periodId: period.id,
    });

    source = 'NORMAL_TIMETABLE';
  }

  const candidates = [];

  for (const entry of entries) {
    const resolved = await resolveCandidate({
      staffId,
      academicYearId,
      date,
      period,
      entry,
      source,
    });

    if (resolved) {
      candidates.push(resolved);
    }
  }

  return candidates;
};

const getGeneratedSession = async ({
  staffId,
  date,
  period,
  assignment,
}) => {
  const session = await prisma.attendanceSession.findUnique({
    where: {
      attendanceDate_periodId_standardId: {
        attendanceDate: startOfDay(date),
        periodId: period.id,
        standardId: assignment.standardId,
      },
    },
    include: SESSION_INCLUDE,
  });

  if (!session) {
    return null;
  }

  if (session.staffId !== staffId) {
    throw new ApiError(
      409,
      'Attendance session exists but is assigned to a different staff member'
    );
  }

  return session;
};

/**
 * Called when the staff opens the Attendance page.
 *
 * It answers:
 * "What attendance session(s), if any, should this staff member mark right now?"
 */
export const getCurrentAttendance = async (userId) => {
  const now = businessNow();
  const today = startOfDay(now);

  const staff = await getStaff(userId);

  const academicYear = await getActiveAcademicYear(today);

  if (!academicYear) {
    return {
      available: false,
      reason: 'NO_ACTIVE_ACADEMIC_YEAR',
      serverTime: now,
    };
  }

  const workingDay = await isWorkingDay({
    academicYearId: academicYear.id,
    date: today,
  });

  if (!workingDay.working) {
    return {
      available: false,
      reason: workingDay.reason,
      serverTime: now,
      academicYear,
    };
  }

  const period = await findCurrentPeriod({
    academicYearId: academicYear.id,
    now,
  });

  if (!period) {
    return {
      available: false,
      reason: 'NO_CURRENT_PERIOD',
      serverTime: now,
      academicYear,
    };
  }

  const fullDayLeave = await hasStaffFullDayLeave({
    staffId: staff.id,
    academicYearId: academicYear.id,
    date: today,
  });

  if (fullDayLeave) {
    return {
      available: false,
      reason: 'STAFF_ON_LEAVE',
      serverTime: now,
      academicYear,
      period,
    };
  }

  const periodLeave = await hasStaffPeriodLeave({
    staffId: staff.id,
    academicYearId: academicYear.id,
    date: today,
    periodId: period.id,
  });

  if (periodLeave) {
    return {
      available: false,
      reason: 'STAFF_ON_PERIOD_LEAVE',
      serverTime: now,
      academicYear,
      period,
    };
  }

  const assignments = await resolveAssignments({
    staffId: staff.id,
    academicYearId: academicYear.id,
    date: today,
    period,
  });

  if (assignments.length === 0) {
    return {
      available: false,
      reason: 'NO_ATTENDANCE_ASSIGNMENT',
      serverTime: now,
      academicYear,
      period,
    };
  }

  const sessions = [];

  for (const assignment of assignments) {
    const session = await getGeneratedSession({
      staffId: staff.id,
      date: today,
      period,
      assignment,
    });

    if (session) sessions.push(session);
  }

  if (sessions.length === 0) {
    return {
      available: false,
      reason: 'ATTENDANCE_SESSION_NOT_GENERATED',
      serverTime: now,
      academicYear,
      period,
    };
  }

  return {
    available: true,
    multiple: sessions.length > 1,
    serverTime: now,
    academicYear,
    period,
    sessions,
  };
};
