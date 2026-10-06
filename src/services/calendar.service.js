import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { parseSchoolDate, startOfDay, endOfDay, weekdayOf, todayKey, addDays } from '../utils/date.js';

const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const normalizeDate = (value) => {
  try { return parseSchoolDate(value); } catch { throw new ApiError(400, 'Invalid date'); }
};


const weekdayOfLocal = (date) => weekdayOf(date);

const ensureYear = async (academicYearId) => {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new ApiError(404, 'Academic year not found');
  return year;
};

const ensureDateInYear = (year, date) => {
  const d = normalizeDate(date);
  const start = normalizeDate(year.startDate);
  const end = endOfDay(year.endDate);
  if (d < start || d > end) {
    throw new ApiError(400, 'Date is outside the selected academic year');
  }
  return d;
};

export const list = async (academicYearId) => {
  await ensureYear(academicYearId);

  const [weeklyHolidays, overrides, exceptions, categories] = await Promise.all([
    prisma.weeklyHoliday.findMany({ where: { academicYearId }, orderBy: { weekday: 'asc' } }),
    prisma.calendarOverride.findMany({
      where: { academicYearId },
      orderBy: { calendarDate: 'asc' },
    }),
    prisma.attendanceException.findMany({
      where: { academicYearId, isActive: true },
      include: { category: true, startPeriod: true, endPeriod: true },
      orderBy: { startDate: 'asc' },
    }),
    prisma.attendanceExceptionCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return { weeklyHolidays, overrides, exceptions, categories };
};

export const month = async (academicYearId, year, monthNumber) => {
  const academicYear = await ensureYear(academicYearId);
  const y = Number(year);
  const m = Number(monthNumber);

  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new ApiError(400, 'year and month must be valid integers');
  }

  // Build the month on IST-midnight instants so it never depends on the
  // server's timezone.
  const first = parseSchoolDate(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const { weeklyHolidays, overrides, exceptions } = await list(academicYearId);

  const weeklyHolidaySet = new Set(weeklyHolidays.map((x) => x.weekday));
  const overrideMap = new Map(
    overrides.map((x) => [normalizeDate(x.calendarDate).getTime(), x])
  );

  const days = [];
  for (let i = 0; i < daysInMonth; i++) {
    const date = addDays(first, i);
    const key = date.getTime();
    const weekday = weekdayOfLocal(date);
    const override = overrideMap.get(key);

    let dayStatus = 'WORKING_DAY';
    let reason = null;
    let exception = null;

    if (override?.type === 'HOLIDAY') {
      dayStatus = 'HOLIDAY';
      reason = override.reason || null;
    } else if (weeklyHolidaySet.has(weekday)) {
      dayStatus = 'HOLIDAY';
      reason = 'Weekly holiday';
    }

    const activeExceptions = exceptions.filter((x) => {
      const start = normalizeDate(x.startDate);
      const end = normalizeDate(x.endDate);
      return date >= start && date <= end;
    });

    const fullDay = activeExceptions.find((x) => x.scope === 'FULL_DAY');
    if (fullDay) {
      dayStatus = 'HOLIDAY';
      reason = fullDay.category?.name || fullDay.reason || 'Attendance exception';
      exception = fullDay;
    } else if (activeExceptions.length) {
      exception = activeExceptions[0];
      reason = exception.category?.name || exception.reason || null;
    }

    if (override?.type === 'WORKING_DAY') {
      dayStatus = 'WORKING_DAY';
      reason = override.reason || null;
    }

    days.push({
      date: todayKey(date),
      weekday,
      dayStatus,
      reason,
      calendarOverride: override || null,
      attendanceException: exception,
    });
  }

  return { academicYear, year: y, month: m, days };
};

export const createOverride = async (academicYearId, data) => {
  const year = await ensureYear(academicYearId);
  const calendarDate = ensureDateInYear(year, data.calendarDate);

  if (!['WORKING_DAY', 'HOLIDAY'].includes(data.type)) {
    throw new ApiError(400, 'type must be WORKING_DAY or HOLIDAY');
  }

  return prisma.calendarOverride.upsert({
    where: { academicYearId_calendarDate: { academicYearId, calendarDate } },
    create: {
      academicYearId,
      calendarDate,
      type: data.type,
      reason: data.reason || null,
    },
    update: {
      type: data.type,
      reason: data.reason || null,
    },
  });
};

export const updateOverride = async (id, data) => {
  const existing = await prisma.calendarOverride.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Calendar override not found');

  if (data.type !== undefined && !['WORKING_DAY', 'HOLIDAY'].includes(data.type)) {
    throw new ApiError(400, 'type must be WORKING_DAY or HOLIDAY');
  }

  return prisma.calendarOverride.update({
    where: { id },
    data: {
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.reason !== undefined ? { reason: data.reason || null } : {}),
    },
  });
};

export const removeOverride = async (id) => {
  const existing = await prisma.calendarOverride.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Calendar override not found');
  return prisma.calendarOverride.delete({ where: { id } });
};

export const listCategories = () =>
  prisma.attendanceExceptionCategory.findMany({
    orderBy: { name: 'asc' },
  });

export const createCategory = async (data) => {
  const name = String(data.name || '').trim();
  const code = String(data.code || '').trim().toUpperCase();
  if (!name || !code) throw new ApiError(400, 'name and code are required');

  return prisma.attendanceExceptionCategory.create({
    data: {
      name,
      code,
      description: data.description || null,
      isActive: data.isActive !== false,
    },
  });
};

export const updateCategory = async (id, data) => {
  const existing = await prisma.attendanceExceptionCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Attendance exception category not found');

  return prisma.attendanceExceptionCategory.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
      ...(data.code !== undefined ? { code: String(data.code).trim().toUpperCase() } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
    },
  });
};

export const removeCategory = async (id) => {
  const count = await prisma.attendanceException.count({ where: { categoryId: id } });
  if (count) throw new ApiError(409, 'Category cannot be deleted because exceptions use it');
  return prisma.attendanceExceptionCategory.delete({ where: { id } });
};

const validateExceptionPeriods = async (academicYearId, startDate, endDate, startPeriodId, endPeriodId) => {
  const [startPeriod, endPeriod] = await Promise.all([
    prisma.period.findUnique({ where: { id: startPeriodId } }),
    prisma.period.findUnique({ where: { id: endPeriodId } }),
  ]);

  if (!startPeriod || !endPeriod) throw new ApiError(400, 'Start and end periods must exist');
  if (startPeriod.academicYearId !== academicYearId || endPeriod.academicYearId !== academicYearId) {
    throw new ApiError(400, 'Exception periods must belong to the selected academic year');
  }

  if (startPeriod.weekday !== weekdayOf(startDate)) {
    throw new ApiError(400, 'Start period weekday does not match start date');
  }
  if (endPeriod.weekday !== weekdayOf(endDate)) {
    throw new ApiError(400, 'End period weekday does not match end date');
  }

  if (
    startDate.getTime() === endDate.getTime() &&
    startPeriod.periodIndex > endPeriod.periodIndex
  ) {
    throw new ApiError(400, 'End period must not be before start period on the same date');
  }

  return { startPeriod, endPeriod };
};

export const listExceptions = async (academicYearId) => {
  await ensureYear(academicYearId);
  return prisma.attendanceException.findMany({
    where: { academicYearId },
    include: { category: true, startPeriod: true, endPeriod: true },
    orderBy: { startDate: 'asc' },
  });
};

export const createException = async (academicYearId, data) => {
  const year = await ensureYear(academicYearId);
  const startDate = ensureDateInYear(year, data.startDate);
  const endDate = ensureDateInYear(year, data.endDate);

  if (endDate < startDate) throw new ApiError(400, 'endDate must be on or after startDate');

  const category = await prisma.attendanceExceptionCategory.findUnique({
    where: { id: data.categoryId },
  });
  if (!category || !category.isActive) {
    throw new ApiError(400, 'Attendance exception category is invalid or inactive');
  }

  const scope = String(data.scope || '').toUpperCase();
  if (!['FULL_DAY', 'PERIOD_RANGE'].includes(scope)) {
    throw new ApiError(400, 'scope must be FULL_DAY or PERIOD_RANGE');
  }

  if (scope === 'FULL_DAY') {
    return prisma.attendanceException.create({
      data: {
        academicYearId,
        categoryId: data.categoryId,
        startDate,
        endDate,
        scope,
        reason: data.reason || null,
      },
      include: { category: true },
    });
  }

  if (!data.startPeriodId || !data.endPeriodId) {
    throw new ApiError(400, 'startPeriodId and endPeriodId are required for PERIOD_RANGE');
  }

  const { startPeriod, endPeriod } = await validateExceptionPeriods(
    academicYearId,
    startDate,
    endDate,
    data.startPeriodId,
    data.endPeriodId
  );

  return prisma.attendanceException.create({
    data: {
      academicYearId,
      categoryId: data.categoryId,
      startDate,
      endDate,
      scope,
      startPeriodId: startPeriod.id,
      endPeriodId: endPeriod.id,
      reason: data.reason || null,
    },
    include: { category: true, startPeriod: true, endPeriod: true },
  });
};

export const updateException = async (id, data) => {
  const existing = await prisma.attendanceException.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Attendance exception not found');

  // For updates that change dates/scope/periods, reuse the same validation rules.
  const academicYearId = existing.academicYearId;
  const year = await ensureYear(academicYearId);
  const startDate = data.startDate !== undefined
    ? ensureDateInYear(year, data.startDate)
    : normalizeDate(existing.startDate);
  const endDate = data.endDate !== undefined
    ? ensureDateInYear(year, data.endDate)
    : normalizeDate(existing.endDate);

  if (endDate < startDate) throw new ApiError(400, 'endDate must be on or after startDate');

  const scope = data.scope !== undefined
    ? String(data.scope).toUpperCase()
    : existing.scope;

  if (!['FULL_DAY', 'PERIOD_RANGE'].includes(scope)) {
    throw new ApiError(400, 'scope must be FULL_DAY or PERIOD_RANGE');
  }

  let startPeriodId = existing.startPeriodId;
  let endPeriodId = existing.endPeriodId;

  if (scope === 'FULL_DAY') {
    startPeriodId = null;
    endPeriodId = null;
  } else {
    startPeriodId = data.startPeriodId ?? existing.startPeriodId;
    endPeriodId = data.endPeriodId ?? existing.endPeriodId;
    if (!startPeriodId || !endPeriodId) {
      throw new ApiError(400, 'startPeriodId and endPeriodId are required for PERIOD_RANGE');
    }
    await validateExceptionPeriods(
      academicYearId,
      startDate,
      endDate,
      startPeriodId,
      endPeriodId
    );
  }

  if (data.categoryId !== undefined) {
    const category = await prisma.attendanceExceptionCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!category || !category.isActive) throw new ApiError(400, 'Invalid exception category');
  }

  return prisma.attendanceException.update({
    where: { id },
    data: {
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      startDate,
      endDate,
      scope,
      startPeriodId,
      endPeriodId,
      ...(data.reason !== undefined ? { reason: data.reason || null } : {}),
      ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
    },
    include: { category: true, startPeriod: true, endPeriod: true },
  });
};

export const removeException = async (id) => {
  const existing = await prisma.attendanceException.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Attendance exception not found');
  return prisma.attendanceException.delete({ where: { id } });
};

export default {
  list,
  month,
  createOverride,
  updateOverride,
  removeOverride,
  listCategories,
  createCategory,
  updateCategory,
  removeCategory,
  listExceptions,
  createException,
  updateException,
  removeException,
};
