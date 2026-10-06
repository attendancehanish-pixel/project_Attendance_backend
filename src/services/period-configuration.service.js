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
/* Generate periods                                                           */
/* -------------------------------------------------------------------------- */

export const generate = async (
  academicYearId,
  {
    weekdays,
    replaceExisting = false,
    sameOutlineForAllDays = false,
    outline = null,
  } = {}
) => {
  await ensureAcademicYear(academicYearId);

  const configuration =
    await prisma.periodConfiguration.findUnique({
      where: { academicYearId },
    });

  if (!configuration) {
    throw new ApiError(
      400,
      'Period configuration has not been created yet'
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Validate weekdays                                                        */
  /* ------------------------------------------------------------------------ */

  const targetWeekdays =
    Array.isArray(weekdays) && weekdays.length > 0
      ? weekdays
      : VALID_WEEKDAYS;

  for (const weekday of targetWeekdays) {
    if (!VALID_WEEKDAYS.includes(weekday)) {
      throw new ApiError(400, `Invalid weekday: ${weekday}`);
    }
  }

  /* Remove duplicates while preserving order */
  const uniqueWeekdays = [...new Set(targetWeekdays)];

  /* ------------------------------------------------------------------------ */
  /* Common outline mode                                                      */
  /* ------------------------------------------------------------------------ */
  if (sameOutlineForAllDays) {
    let effectiveOutline = outline;

    if (!Array.isArray(effectiveOutline) || effectiveOutline.length === 0) {
      // No outline in the request — fall back to the persisted one.
      const stored = await prisma.periodOutline.findMany({
        where: { academicYearId },
        orderBy: { periodIndex: "asc" },
      });

      if (stored.length === 0) {
        throw new ApiError(
          400,
          'outline is required when sameOutlineForAllDays is enabled'
        );
      }

      effectiveOutline = stored.map((row) => ({
        periodIndex: row.periodIndex,
        startTime: row.startTime,
        endTime: row.endTime,
        durationMinutes: row.durationMinutes,
        breakAfterMinutes: row.breakAfterMinutes,
      }));
    }

    const validatedOutline = validateOutline(effectiveOutline);

    // NOTE: We intentionally do NOT compare validatedOutline.length against
    // configuration.totalPeriodCount. The outline is the source of truth;
    // the config is updated to match it inside the transaction below.

    if (!replaceExisting) {
      const existingPeriods = await prisma.period.findMany({
        where: {
          academicYearId,
          weekday: {
            in: uniqueWeekdays,
          },
        },

        select: {
          id: true,
          weekday: true,
          periodIndex: true,

          _count: {
            select: {
              timetableEntries: true,
              attendanceSessions: true,
              staffPeriodLeaves: true,
              substitutions: true,
              dateTimetableEntries: true,
            },
          },
        },
      });

      const lockedPeriods = existingPeriods.filter(
        (period) =>
          period._count.timetableEntries > 0 ||
          period._count.attendanceSessions > 0 ||
          period._count.staffPeriodLeaves > 0 ||
          period._count.substitutions > 0 ||
          period._count.dateTimetableEntries > 0
      );

      if (lockedPeriods.length > 0) {
        const firstLocked = lockedPeriods[0];

        throw new ApiError(
          409,
          `Cannot regenerate period ${firstLocked.periodIndex} on ${firstLocked.weekday} because it is already being used by timetable or attendance data`
        );
      }
    }

    /* ---------------------------------------------------------------------- */
    /* Transaction                                                             */
    /* ---------------------------------------------------------------------- */

    return prisma.$transaction(async (tx) => {
      if (replaceExisting) {
        await tx.period.deleteMany({
          where: {
            academicYearId,
            weekday: {
              in: uniqueWeekdays,
            },
          },
        });
      }

      const createdPeriods = [];

      for (const weekday of uniqueWeekdays) {
        for (const item of validatedOutline) {
          const period = await tx.period.upsert({
            where: {
              academicYearId_weekday_periodIndex: {
                academicYearId,
                weekday,
                periodIndex: item.periodIndex,
              },
            },

            create: {
              academicYearId,
              weekday,
              periodIndex: item.periodIndex,
              startTime: item.startTime,
              endTime: item.endTime,
            },

            update: {
              startTime: item.startTime,
              endTime: item.endTime,
            },
          });

          createdPeriods.push(period);
        }
      }

      /*
       * Keep PeriodConfiguration synchronized with the actual outline.
       * The outline is the source of truth in this mode.
       */
      await tx.periodConfiguration.update({
        where: {
          academicYearId,
        },

        data: {
          totalPeriodCount: validatedOutline.length,

          sameOutlineForAllDays: true,

          firstPeriodStartTime: validatedOutline[0].startTime,

          defaultDurationMinutes: validatedOutline[0].durationMinutes,

          defaultBreakMinutes:
            validatedOutline[0].breakAfterMinutes ?? 0,
        },
      });

      return {
        academicYearId,
        weekdays: uniqueWeekdays,
        periodCount: validatedOutline.length,
        periods: createdPeriods,
      };
    },   {
    timeout: 15000,
  });
  }

  /* ------------------------------------------------------------------------ */
  /* Default configuration generation                                        */
  /* ------------------------------------------------------------------------ */

  if (
    !configuration.firstPeriodStartTime ||
    !configuration.defaultDurationMinutes
  ) {
    throw new ApiError(
      400,
      'firstPeriodStartTime and defaultDurationMinutes are required to generate periods'
    );
  }

  const totalPeriodCount = configuration.totalPeriodCount;

  const duration = configuration.defaultDurationMinutes;

  const breakMinutes = configuration.defaultBreakMinutes ?? 0;

  const generatedOutline = [];

  let currentStart = timeToMinutes(
    configuration.firstPeriodStartTime
  );

  for (
    let periodIndex = 1;
    periodIndex <= totalPeriodCount;
    periodIndex += 1
  ) {
    const startTime = minutesToTime(currentStart);

    const endMinutes = currentStart + duration;

    const endTime = minutesToTime(endMinutes);

    generatedOutline.push({
      periodIndex,
      startTime,
      endTime,
    });

    currentStart = endMinutes + breakMinutes;
  }

  /* ------------------------------------------------------------------------ */
  /* Existing period safety check                                             */
  /* ------------------------------------------------------------------------ */

  if (!replaceExisting) {
    const existingPeriods = await prisma.period.findMany({
      where: {
        academicYearId,
        weekday: {
          in: uniqueWeekdays,
        },
      },

      select: {
        id: true,
        weekday: true,
        periodIndex: true,

        _count: {
          select: {
            timetableEntries: true,
            attendanceSessions: true,
            staffPeriodLeaves: true,
            substitutions: true,
            dateTimetableEntries: true,
          },
        },
      },
    });

    const lockedPeriods = existingPeriods.filter(
      (period) =>
        period._count.timetableEntries > 0 ||
        period._count.attendanceSessions > 0 ||
        period._count.staffPeriodLeaves > 0 ||
        period._count.substitutions > 0 ||
        period._count.dateTimetableEntries > 0
    );

    if (lockedPeriods.length > 0) {
      const firstLocked = lockedPeriods[0];

      throw new ApiError(
        409,
        `Cannot regenerate period ${firstLocked.periodIndex} on ${firstLocked.weekday} because it is already being used by timetable or attendance data`
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Transaction                                                             */
  /* ------------------------------------------------------------------------ */

  return prisma.$transaction(async (tx) => {
    if (replaceExisting) {
      await tx.period.deleteMany({
        where: {
          academicYearId,
          weekday: {
            in: uniqueWeekdays,
          },
        },
      });
    }

    const createdPeriods = [];

    for (const weekday of uniqueWeekdays) {
      for (const item of generatedOutline) {
        const period = await tx.period.upsert({
          where: {
            academicYearId_weekday_periodIndex: {
              academicYearId,
              weekday,
              periodIndex: item.periodIndex,
            },
          },

          create: {
            academicYearId,
            weekday,
            periodIndex: item.periodIndex,
            startTime: item.startTime,
            endTime: item.endTime,
          },

          update: {
            startTime: item.startTime,
            endTime: item.endTime,
          },
        });

        createdPeriods.push(period);
      }
    }

    return {
      academicYearId,
      weekdays: uniqueWeekdays,
      periodCount: generatedOutline.length,
      periods: createdPeriods,
    }, {
      timeout: 15000,
    };
  });
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