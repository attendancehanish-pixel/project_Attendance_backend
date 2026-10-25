import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
/**
 * Replaces the persisted outline for an academic year inside a transaction.
 * If `outline` is null/empty, all rows are removed.
 */
const persistOutline = async (tx, academicYearId, outline) => {
  await tx.periodOutline.deleteMany({ where: { academicYearId } });

  if (!Array.isArray(outline) || outline.length === 0) return [];

  const rows = outline.map((item) => ({
    academicYearId,
    periodIndex: item.periodIndex,
    startTime: item.startTime,
    endTime: item.endTime,
    durationMinutes: item.durationMinutes,
    breakAfterMinutes: item.breakAfterMinutes ?? 0,
  }));

  await tx.periodOutline.createMany({ data: rows });

  return rows;
};

const VALID_WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const validateTime = (value, field = 'time') => {
  if (value == null || value === '') return null;

  if (!timePattern.test(String(value))) {
    throw new ApiError(400, `${field} must be in HH:mm format`);
  }

  return String(value);
};

const timeToMinutes = (time) => {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const normalized = minutes % (24 * 60);

  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/* -------------------------------------------------------------------------- */
/* Configuration validation                                                   */
/* -------------------------------------------------------------------------- */

const validateConfig = (data) => {
  const totalPeriodCount = Number(data.totalPeriodCount);

  if (
    !Number.isInteger(totalPeriodCount) ||
    totalPeriodCount < 1 ||
    totalPeriodCount > 30
  ) {
    throw new ApiError(
      400,
      'totalPeriodCount must be an integer between 1 and 30'
    );
  }

  const sameOutlineForAllDays = data.sameOutlineForAllDays !== false;

  const result = {
    totalPeriodCount,

    defaultDurationMinutes:
      data.defaultDurationMinutes == null ||
        data.defaultDurationMinutes === ''
        ? null
        : Number(data.defaultDurationMinutes),

    isDurationDefault: data.isDurationDefault !== false,

    sameOutlineForAllDays,

    firstPeriodStartTime: validateTime(
      data.firstPeriodStartTime,
      'firstPeriodStartTime'
    ),

    defaultBreakMinutes:
      data.defaultBreakMinutes == null ||
        data.defaultBreakMinutes === ''
        ? null
        : Number(data.defaultBreakMinutes),
  };

  if (
    result.defaultDurationMinutes != null &&
    (!Number.isInteger(result.defaultDurationMinutes) ||
      result.defaultDurationMinutes < 1)
  ) {
    throw new ApiError(
      400,
      'defaultDurationMinutes must be a positive integer'
    );
  }

  if (
    result.defaultBreakMinutes != null &&
    (!Number.isInteger(result.defaultBreakMinutes) ||
      result.defaultBreakMinutes < 0)
  ) {
    throw new ApiError(
      400,
      'defaultBreakMinutes must be a non-negative integer'
    );
  }

  // Only require default duration / start time when we are NOT using the
  // common-outline mode. In outline mode, the outline itself supplies the
  // per-period durations and start times.
  if (
    result.isDurationDefault &&
    !result.sameOutlineForAllDays &&
    (!result.defaultDurationMinutes || !result.firstPeriodStartTime)
  ) {
    throw new ApiError(
      400,
      'firstPeriodStartTime and defaultDurationMinutes are required when using default duration'
    );
  }

  return result;
};

/* -------------------------------------------------------------------------- */
/* Outline validation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Validates and normalizes an outline.
 *
 * The client may send any of:
 *   { periodIndex, startTime, durationMinutes, breakAfterMinutes }
 *   { periodIndex, startTime, endTime,              breakAfterMinutes }
 *   { periodIndex, startTime, durationMinutes, endTime }
 *
 * The client's `breakAfterMinutes` is IGNORED — the server derives it from
 * the actual gap between consecutive periods. This keeps the outline
 * internally consistent even if the frontend leaves stale break values behind
 * (e.g. after removing a middle period).
 */
const validateOutline = (outline) => {
  if (!Array.isArray(outline) || outline.length === 0) {
    throw new ApiError(400, 'outline must be a non-empty array');
  }

  if (outline.length > 30) {
    throw new ApiError(
      400,
      'outline cannot contain more than 30 periods'
    );
  }

  const normalized = outline.map((item, index) => {
    const periodIndex = Number(item.periodIndex);

    if (
      !Number.isInteger(periodIndex) ||
      periodIndex < 1 ||
      periodIndex > 30
    ) {
      throw new ApiError(
        400,
        `outline period ${index + 1}: periodIndex must be an integer between 1 and 30`
      );
    }

    const startTime = validateTime(
      item.startTime,
      `outline period ${periodIndex} startTime`
    );

    if (!startTime) {
      throw new ApiError(
        400,
        `outline period ${periodIndex}: startTime is required`
      );
    }

    let endTime = null;

    if (item.endTime != null && item.endTime !== '') {
      endTime = validateTime(
        item.endTime,
        `outline period ${periodIndex} endTime`
      );
    }

    let durationMinutes = null;

    if (
      item.durationMinutes != null &&
      item.durationMinutes !== ''
    ) {
      durationMinutes = Number(item.durationMinutes);

      if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
        throw new ApiError(
          400,
          `outline period ${periodIndex}: durationMinutes must be a positive integer`
        );
      }
    }

    if (!endTime && !durationMinutes) {
      throw new ApiError(
        400,
        `outline period ${periodIndex}: either endTime or durationMinutes is required`
      );
    }

    // Derive endTime from duration if not supplied.
    if (!endTime) {
      endTime = minutesToTime(
        timeToMinutes(startTime) + durationMinutes
      );
    }

    // Derive / verify duration.
    const calculatedDuration =
      timeToMinutes(endTime) - timeToMinutes(startTime);

    if (calculatedDuration <= 0) {
      throw new ApiError(
        400,
        `outline period ${periodIndex}: endTime must be after startTime`
      );
    }

    if (
      durationMinutes != null &&
      durationMinutes !== calculatedDuration
    ) {
      throw new ApiError(
        400,
        `outline period ${periodIndex}: durationMinutes does not match startTime and endTime`
      );
    }

    durationMinutes = calculatedDuration;

    return {
      periodIndex,
      startTime,
      endTime,
      durationMinutes,
      breakAfterMinutes: 0,
    };
  });

  /* ------------------------------------------------------------------------ */
  /* Ensure period indexes are sequential                                     */
  /* ------------------------------------------------------------------------ */

  normalized.sort((a, b) => a.periodIndex - b.periodIndex);

  normalized.forEach((period, index) => {
    const expectedIndex = index + 1;

    if (period.periodIndex !== expectedIndex) {
      throw new ApiError(
        400,
        `outline period indexes must be sequential starting from 1`
      );
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Validate no overlaps and derive breakAfterMinutes from the timeline      */
  /* ------------------------------------------------------------------------ */

  for (let i = 0; i < normalized.length - 1; i += 1) {
    const current = normalized[i];
    const next = normalized[i + 1];

    const currentEnd = timeToMinutes(current.endTime);
    const nextStart = timeToMinutes(next.startTime);

    if (nextStart < currentEnd) {
      throw new ApiError(
        400,
        `outline period ${next.periodIndex} starts before period ${current.periodIndex} ends`
      );
    }

    // The actual break is the gap between the end of this period and the
    // start of the next period. We trust the server-derived timeline, not
    // the client value.
    current.breakAfterMinutes = nextStart - currentEnd;
  }

  // There is no "break after" the final period.
  normalized[normalized.length - 1].breakAfterMinutes = 0;

  return normalized;
};

/* -------------------------------------------------------------------------- */
/* Academic year                                                              */
/* -------------------------------------------------------------------------- */

const ensureAcademicYear = async (academicYearId) => {
  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
  });

  if (!year) {
    throw new ApiError(404, 'Academic year not found');
  }

  return year;
};

/* -------------------------------------------------------------------------- */
/* Existing configuration APIs                                                */
/* -------------------------------------------------------------------------- */

export const get = async (academicYearId) => {
  await ensureAcademicYear(academicYearId);

  return prisma.periodConfiguration.findUnique({
    where: { academicYearId },
  });
};

export const upsert = async (academicYearId, data) => {
  await ensureAcademicYear(academicYearId);

  const config = validateConfig(data);

  // If the caller sent an outline, validate it now so we can persist
  // it atomically with the config.
  const hasOutlineField = Array.isArray(data.outline);
  const validatedOutline = hasOutlineField
    ? validateOutline(data.outline)
    : null;

  return prisma.$transaction(async (tx) => {
    const savedConfig = await tx.periodConfiguration.upsert({
      where: { academicYearId },
      create: { academicYearId, ...config },
      update: config,
    });

    if (hasOutlineField) {
      // Only persist outline when the mode is enabled. If the user
      // turned sameOutlineForAllDays off, wipe any stored outline.
      if (config.sameOutlineForAllDays) {
        await persistOutline(tx, academicYearId, validatedOutline);
      } else {
        await persistOutline(tx, academicYearId, null);
      }
    }

    return savedConfig;
  },  {
    timeout: 15000,
  });
};

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

export const getSetup = async (academicYearId) => {
  const [
    academicYear,
    configuration,
    periods,
    weeklyHolidays,
    periodOutline,
  ] = await Promise.all([
    prisma.academicYear.findUnique({
      where: { id: academicYearId },
    }),

    prisma.periodConfiguration.findUnique({
      where: { academicYearId },
    }),

    prisma.period.findMany({
      where: { academicYearId },
      orderBy: [{ weekday: "asc" }, { periodIndex: "asc" }],
    }),

    prisma.weeklyHoliday.findMany({
      where: { academicYearId },
      orderBy: { weekday: "asc" },
    }),

    prisma.periodOutline.findMany({
      where: { academicYearId },
      orderBy: { periodIndex: "asc" },
    }),
  ]);

  if (!academicYear) {
    throw new ApiError(404, "Academic year not found");
  }

  return {
    academicYear,
    configuration,
    periods,
    weeklyHolidays,
    outline: periodOutline,
  };
};

/* -------------------------------------------------------------------------- */
/* Generate / re-generate periods                                             */
/* -------------------------------------------------------------------------- */

/**
 * Builds the outline used for generation when the "same outline for all days"
 * mode is OFF: it is derived from the saved default configuration.
 */
const buildOutlineFromConfiguration = (configuration) => {
  if (!configuration.firstPeriodStartTime || !configuration.defaultDurationMinutes) {
    throw new ApiError(
      400,
      'firstPeriodStartTime and defaultDurationMinutes are required to generate periods'
    );
  }

  const duration = configuration.defaultDurationMinutes;
  const breakMinutes = configuration.defaultBreakMinutes ?? 0;
  const generated = [];
  let cursor = timeToMinutes(configuration.firstPeriodStartTime);

  for (let periodIndex = 1; periodIndex <= configuration.totalPeriodCount; periodIndex += 1) {
    const end = cursor + duration;
    generated.push({
      periodIndex,
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(end),
      durationMinutes: duration,
      breakAfterMinutes: periodIndex === configuration.totalPeriodCount ? 0 : breakMinutes,
    });
    cursor = end + breakMinutes;
  }

  return generated;
};

/**
 * Resolves the outline (the list of periods every selected weekday should end
 * up with) for the request.
 */
const resolveTargetOutline = async (academicYearId, configuration, sameOutlineForAllDays, outline) => {
  if (!sameOutlineForAllDays) {
    return { outline: buildOutlineFromConfiguration(configuration), fromRequest: false };
  }

  if (Array.isArray(outline) && outline.length > 0) {
    return { outline: validateOutline(outline), fromRequest: true };
  }

  // No outline in the request - fall back to the persisted one.
  const stored = await prisma.periodOutline.findMany({
    where: { academicYearId },
    orderBy: { periodIndex: 'asc' },
  });

  if (stored.length === 0) {
    throw new ApiError(400, 'outline is required when sameOutlineForAllDays is enabled');
  }

  return {
    outline: validateOutline(
      stored.map((row) => ({
        periodIndex: row.periodIndex,
        startTime: row.startTime,
        endTime: row.endTime,
        durationMinutes: row.durationMinutes,
      }))
    ),
    fromRequest: false,
  };
};

const countsOf = (period) => ({
  timetableEntries: period._count.timetableEntries,
  dateTimetableEntries: period._count.dateTimetableEntries,
  attendanceSessions: period._count.attendanceSessions,
  substitutions: period._count.substitutions,
  staffPeriodLeaves: period._count.staffPeriodLeaves,
  attendanceExceptions: period._count.exceptionStartFor + period._count.exceptionEndFor,
});

// Data that can never be silently deleted: it is history (attendance) or
// leave/substitution/exception records that point at a specific period.
const hasProtectedData = (counts) =>
  counts.attendanceSessions > 0 ||
  counts.substitutions > 0 ||
  counts.staffPeriodLeaves > 0 ||
  counts.attendanceExceptions > 0;

// Data the admin may explicitly allow us to delete (the timetable itself).
const hasTimetableData = (counts) =>
  counts.timetableEntries > 0 || counts.dateTimetableEntries > 0;

const describeObsolete = (period) => ({
  periodId: period.id,
  weekday: period.weekday,
  periodIndex: period.periodIndex,
  ...countsOf(period),
});

/**
 * Generates - or RE-generates - the periods of an academic year.
 *
 * Re-generation never deletes a period just to re-create it. Existing periods
 * are UPDATED IN PLACE (same id), so timetable entries, date-specific entries
 * and attendance sessions that point at them stay valid while the admin changes
 * start/end times or ADDS periods.
 *
 * The only destructive case is when the new schedule has FEWER periods than
 * the current one. Those surplus periods ("obsolete") are removed only when:
 *   - nothing protected references them (attendance sessions, substitutions,
 *     staff period leaves, attendance exceptions), and
 *   - if timetable entries reference them, the caller explicitly passes
 *     `removeObsoleteTimetable: true`.
 *
 * `dryRun: true` returns the plan without writing anything.
 *
 * `replaceExisting` is accepted for backward compatibility but is no longer
 * needed (and no longer deletes everything).
 */
export const generate = async (
  academicYearId,
  {
    weekdays,
    sameOutlineForAllDays = false,
    outline = null,
    dryRun = false,
    removeObsoleteTimetable = false,
  } = {}
) => {
  await ensureAcademicYear(academicYearId);

  const configuration = await prisma.periodConfiguration.findUnique({
    where: { academicYearId },
  });

  if (!configuration) {
    throw new ApiError(400, 'Period configuration has not been created yet');
  }

  /* ------------------------------------------------------------------------ */
  /* Weekdays                                                                 */
  /* ------------------------------------------------------------------------ */

  const targetWeekdays =
    Array.isArray(weekdays) && weekdays.length > 0 ? weekdays : VALID_WEEKDAYS;

  for (const weekday of targetWeekdays) {
    if (!VALID_WEEKDAYS.includes(weekday)) {
      throw new ApiError(400, `Invalid weekday: ${weekday}`);
    }
  }

  const uniqueWeekdays = [...new Set(targetWeekdays)];

  /* ------------------------------------------------------------------------ */
  /* Target outline                                                           */
  /* ------------------------------------------------------------------------ */

  const { outline: targetOutline, fromRequest } = await resolveTargetOutline(
    academicYearId,
    configuration,
    Boolean(sameOutlineForAllDays),
    outline
  );

  /* ------------------------------------------------------------------------ */
  /* Build the plan: create / update / unchanged / obsolete                   */
  /* ------------------------------------------------------------------------ */

  const existing = await prisma.period.findMany({
    where: { academicYearId, weekday: { in: uniqueWeekdays } },
    select: {
      id: true,
      weekday: true,
      periodIndex: true,
      startTime: true,
      endTime: true,
      _count: {
        select: {
          timetableEntries: true,
          dateTimetableEntries: true,
          attendanceSessions: true,
          substitutions: true,
          staffPeriodLeaves: true,
          exceptionStartFor: true,
          exceptionEndFor: true,
        },
      },
    },
  });

  const existingByKey = new Map(
    existing.map((period) => [`${period.weekday}:${period.periodIndex}`, period])
  );
  const targetKeys = new Set();

  const toCreate = [];
  const toUpdate = [];
  let unchanged = 0;

  for (const weekday of uniqueWeekdays) {
    for (const item of targetOutline) {
      const key = `${weekday}:${item.periodIndex}`;
      targetKeys.add(key);

      const current = existingByKey.get(key);

      if (!current) {
        toCreate.push({
          academicYearId,
          weekday,
          periodIndex: item.periodIndex,
          startTime: item.startTime,
          endTime: item.endTime,
        });
      } else if (current.startTime !== item.startTime || current.endTime !== item.endTime) {
        toUpdate.push({ id: current.id, startTime: item.startTime, endTime: item.endTime });
      } else {
        unchanged += 1;
      }
    }
  }

  const obsolete = existing.filter(
    (period) => !targetKeys.has(`${period.weekday}:${period.periodIndex}`)
  );

  const blocked = obsolete.filter((period) => hasProtectedData(countsOf(period)));
  const removableWithTimetable = obsolete.filter((period) => {
    const counts = countsOf(period);
    return !hasProtectedData(counts) && hasTimetableData(counts);
  });
  const removableClean = obsolete.filter((period) => {
    const counts = countsOf(period);
    return !hasProtectedData(counts) && !hasTimetableData(counts);
  });

  const plan = {
    academicYearId,
    weekdays: uniqueWeekdays,
    periodCount: targetOutline.length,
    summary: {
      create: toCreate.length,
      update: toUpdate.length,
      unchanged,
      remove: removableClean.length + removableWithTimetable.length,
    },
    // Surplus periods that still hold timetable entries. They are deleted
    // together with those entries only if removeObsoleteTimetable is true.
    requiresTimetableRemoval: removableWithTimetable.map(describeObsolete),
    // Surplus periods that cannot be removed at all (attendance history etc).
    blocked: blocked.map(describeObsolete),
  };

  plan.canApply =
    plan.blocked.length === 0 &&
    (plan.requiresTimetableRemoval.length === 0 || removeObsoleteTimetable === true);

  if (dryRun) {
    return { ...plan, dryRun: true };
  }

  /* ------------------------------------------------------------------------ */
  /* Guard rails                                                              */
  /* ------------------------------------------------------------------------ */

  if (blocked.length > 0) {
    const first = blocked[0];
    throw new ApiError(
      409,
      `Cannot remove period ${first.periodIndex} on ${first.weekday} because attendance, substitution, leave or exception data already uses it. Keep that period in the schedule, or clear that data first.`,
      { code: 'PERIOD_IN_USE', blocked: plan.blocked }
    );
  }

  if (removableWithTimetable.length > 0 && removeObsoleteTimetable !== true) {
    throw new ApiError(
      409,
      'The new schedule has fewer periods than the current one and some of the removed periods already have timetable entries. Confirm to delete those timetable entries and continue.',
      { code: 'TIMETABLE_ENTRIES_AFFECTED', requiresTimetableRemoval: plan.requiresTimetableRemoval }
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Apply                                                                    */
  /* ------------------------------------------------------------------------ */

  const removedTimetable = { timetableEntries: 0, dateTimetableEntries: 0 };

  await prisma.$transaction(
    async (tx) => {
      const obsoleteIds = obsolete.map((period) => period.id);

      if (obsoleteIds.length > 0) {
        const dateResult = await tx.dateSpecificTimetableEntry.deleteMany({
          where: { periodId: { in: obsoleteIds } },
        });
        const entryResult = await tx.timetableEntry.deleteMany({
          where: { periodId: { in: obsoleteIds } },
        });

        removedTimetable.dateTimetableEntries = dateResult.count;
        removedTimetable.timetableEntries = entryResult.count;

        await tx.period.deleteMany({ where: { id: { in: obsoleteIds } } });
      }

      for (const row of toUpdate) {
        await tx.period.update({
          where: { id: row.id },
          data: { startTime: row.startTime, endTime: row.endTime },
        });
      }

      if (toCreate.length > 0) {
        await tx.period.createMany({ data: toCreate });
      }

      if (sameOutlineForAllDays) {
        // The outline is the source of truth in this mode: keep the stored
        // outline and the configuration synchronised with what was generated.
        if (fromRequest) {
          await persistOutline(tx, academicYearId, targetOutline);
        }

        await tx.periodConfiguration.update({
          where: { academicYearId },
          data: {
            totalPeriodCount: targetOutline.length,
            sameOutlineForAllDays: true,
            firstPeriodStartTime: targetOutline[0].startTime,
            defaultDurationMinutes: targetOutline[0].durationMinutes,
            defaultBreakMinutes: targetOutline[0].breakAfterMinutes ?? 0,
          },
        });
      }
    },
    { timeout: 30000 }
  );

  const periods = await prisma.period.findMany({
    where: { academicYearId },
    orderBy: [{ weekday: 'asc' }, { periodIndex: 'asc' }],
  });

  return {
    ...plan,
    dryRun: false,
    applied: true,
    removedTimetable,
    periods,
  };
};

/* -------------------------------------------------------------------------- */
/* Default export                                                             */
/* -------------------------------------------------------------------------- */

export default {
  get,
  upsert,
  getSetup,
  generate,
};