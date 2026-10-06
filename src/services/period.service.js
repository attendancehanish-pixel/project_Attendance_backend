import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

export const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const timeToMinutes = (value) => {
  if (!timePattern.test(String(value))) {
    throw new ApiError(400, 'Time must be in HH:mm format');
  }
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const normalizeWeekday = (value) => {
  const day = String(value).toUpperCase();
  if (!WEEKDAYS.includes(day)) throw new ApiError(400, 'Invalid weekday');
  return day;
};

const validatePeriodInput = ({ periodIndex, startTime, endTime }) => {
  const index = Number(periodIndex);
  if (!Number.isInteger(index) || index < 1) {
    throw new ApiError(400, 'periodIndex must be a positive integer');
  }

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (end <= start) throw new ApiError(400, 'endTime must be after startTime');

  return { periodIndex: index, startTime: String(startTime), endTime: String(endTime) };
};

const ensureYear = async (academicYearId) => {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new ApiError(404, 'Academic year not found');
  return year;
};

export const list = async (academicYearId, weekday) => {
  await ensureYear(academicYearId);

  return prisma.period.findMany({
    where: {
      academicYearId,
      ...(weekday ? { weekday: normalizeWeekday(weekday) } : {}),
    },
    orderBy: [{ weekday: 'asc' }, { periodIndex: 'asc' }],
  });
};

export const get = async (id) => {
  const period = await prisma.period.findUnique({
    where: { id },
    include: { academicYear: true },
  });
  if (!period) throw new ApiError(404, 'Period not found');
  return period;
};

export const create = async (academicYearId, data) => {
  await ensureYear(academicYearId);
  const weekday = normalizeWeekday(data.weekday);
  const values = validatePeriodInput(data);

  if (data.periodIndex > 30) throw new ApiError(400, 'periodIndex cannot exceed 30');

  const existing = await prisma.period.findUnique({
    where: {
      academicYearId_weekday_periodIndex: {
        academicYearId,
        weekday,
        periodIndex: values.periodIndex,
      },
    },
  });
  if (existing) throw new ApiError(409, 'This period already exists for the selected weekday');

  return prisma.period.create({
    data: { academicYearId, weekday, ...values },
  });
};

export const update = async (id, data) => {
  const existing = await prisma.period.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Period not found');

  const weekday = data.weekday === undefined ? existing.weekday : normalizeWeekday(data.weekday);
  const values = validatePeriodInput({
    periodIndex: data.periodIndex ?? existing.periodIndex,
    startTime: data.startTime ?? existing.startTime,
    endTime: data.endTime ?? existing.endTime,
  });

  const conflict = await prisma.period.findFirst({
    where: {
      academicYearId: existing.academicYearId,
      weekday,
      periodIndex: values.periodIndex,
      id: { not: id },
    },
  });
  if (conflict) throw new ApiError(409, 'Another period already uses this weekday and period number');

  return prisma.period.update({
    where: { id },
    data: { weekday, ...values },
  });
};

export const remove = async (id) => {
  const period = await prisma.period.findUnique({ where: { id } });
  if (!period) throw new ApiError(404, 'Period not found');

  const [timetableCount, attendanceCount, substitutionCount, leaveCount] = await Promise.all([
    prisma.timetableEntry.count({ where: { periodId: id } }),
    prisma.attendanceSession.count({ where: { periodId: id } }),
    prisma.periodSubstitution.count({ where: { periodId: id } }),
    prisma.staffPeriodLeave.count({ where: { periodId: id } }),
  ]);

  if (timetableCount || attendanceCount || substitutionCount || leaveCount) {
    throw new ApiError(
      409,
      'Period cannot be deleted because it is already referenced by timetable, attendance, substitution, or leave data'
    );
  }

  return prisma.period.delete({ where: { id } });
};

export const generate = async (academicYearId, options = {}) => {
  const year = await ensureYear(academicYearId);
  const config = await prisma.periodConfiguration.findUnique({ where: { academicYearId } });
  if (!config) throw new ApiError(400, 'Period configuration must be saved before generating periods');

  if (!config.firstPeriodStartTime || !config.defaultDurationMinutes) {
    throw new ApiError(400, 'firstPeriodStartTime and defaultDurationMinutes are required to generate periods');
  }

  const existingCount = await prisma.period.count({ where: { academicYearId } });
  if (existingCount && options.replaceExisting !== true) {
    throw new ApiError(
      409,
      'Periods already exist. Edit them individually or explicitly request replaceExisting.'
    );
  }

  if (existingCount && options.replaceExisting === true) {
    const refs = await Promise.all([
      prisma.timetableEntry.count({ where: { academicYearId } }),
      prisma.attendanceSession.count({ where: { academicYearId } }),
      prisma.periodSubstitution.count({
        where: { period: { academicYearId } },
      }),
      prisma.staffPeriodLeave.count({
        where: { period: { academicYearId } },
      }),
    ]);

    if (refs.some(Boolean)) {
      throw new ApiError(409, 'Existing periods cannot be replaced after they have been referenced');
    }
  }

  const weekdays = options.weekdays
    ? [...new Set(options.weekdays.map(normalizeWeekday))]
    : WEEKDAYS;

  const count = Number(config.totalPeriodCount);
  const duration = Number(config.defaultDurationMinutes);
  const breakMinutes = Number(config.defaultBreakMinutes || 0);
  let start = timeToMinutes(config.firstPeriodStartTime);

  const rows = [];
  for (const weekday of weekdays) {
    let cursor = start;
    for (let periodIndex = 1; periodIndex <= count; periodIndex += 1) {
      const periodStart = cursor;
      const periodEnd = periodStart + duration;
      rows.push({
        academicYearId,
        weekday,
        periodIndex,
        startTime: minutesToTime(periodStart),
        endTime: minutesToTime(periodEnd),
      });
      cursor = periodEnd + breakMinutes;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    if (existingCount && options.replaceExisting === true) {
      await tx.period.deleteMany({ where: { academicYearId } });
    }
    await tx.period.createMany({ data: rows });
    return tx.period.findMany({
      where: { academicYearId },
      orderBy: [{ weekday: 'asc' }, { periodIndex: 'asc' }],
    });
  });

  return {
    academicYearId,
    academicYear: year,
    generated: result.length,
    periods: result,
  };
};

export default { list, get, create, update, remove, generate };
