import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { parseSchoolDate, startOfDay, endOfDay, weekdayOf } from '../utils/date.js';

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
  try { return parseSchoolDate(value); } catch { throw new ApiError(400, 'Invalid calendarDate'); }
};

const ensureYear = async (academicYearId) => {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new ApiError(404, 'Academic year not found');
  return year;
};

const ensureDateInYear = (year, date) => {
  const d = normalizeDate(date);
  const start = normalizeDate(year.startDate);
  const end = endOfDay(year.endDate);
  if (d < start || d > end) throw new ApiError(400, 'Date is outside the academic year');
  return d;
};

const ensureWorkingDate = async (academicYearId, date) => {
  const weekday = weekdayOf(date);

  const [weeklyHoliday, override, fullDayException] = await Promise.all([
    prisma.weeklyHoliday.findUnique({
      where: { academicYearId_weekday: { academicYearId, weekday } },
    }),
    prisma.calendarOverride.findUnique({
      where: { academicYearId_calendarDate: { academicYearId, calendarDate: date } },
    }),
    prisma.attendanceException.findFirst({
      where: {
        academicYearId,
        isActive: true,
        scope: 'FULL_DAY',
        startDate: { lte: date },
        endDate: { gte: date },
      },
    }),
  ]);

  if (override?.type === 'HOLIDAY') {
    throw new ApiError(409, 'This date is configured as a holiday');
  }

  if (fullDayException) {
    throw new ApiError(409, 'This date is blocked by a full-day attendance exception');
  }

  if (weeklyHoliday && override?.type !== 'WORKING_DAY') {
    throw new ApiError(
      409,
      'This weekday is a weekly holiday. Create a WORKING_DAY calendar override before adding a special timetable.'
    );
  }
};

const ensurePeriod = async (academicYearId, periodId, date) => {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.academicYearId !== academicYearId) {
    throw new ApiError(400, 'Period does not belong to the academic year');
  }

  const weekday = weekdayOf(date);
  if (period.weekday !== weekday) {
    throw new ApiError(400, 'Selected period does not belong to the date weekday');
  }

  return period;
};

const ensureSubjectAllocation = async (academicYearId, standardId, subjectId) => {
  const allocation = await prisma.subjectAllocation.findUnique({
    where: {
      academicYearId_standardId_subjectId: {
        academicYearId,
        standardId,
        subjectId,
      },
    },
  });
  if (!allocation) {
    throw new ApiError(400, 'Subject is not allocated to this standard for the academic year');
  }
};

export const list = async (academicYearId, date, standardId) => {
  await ensureYear(academicYearId);

  return prisma.dateSpecificTimetableEntry.findMany({
    where: {
      academicYearId,
      ...(date ? { calendarDate: normalizeDate(date) } : {}),
      ...(standardId ? { standardId } : {}),
    },
    include: { period: true, standard: true, subject: true },
    orderBy: [{ calendarDate: 'asc' }, { period: { periodIndex: 'asc' } }],
  });
};

export const create = async (academicYearId, data) => {
  const year = await ensureYear(academicYearId);
  const calendarDate = ensureDateInYear(year, data.calendarDate);

  await ensureWorkingDate(academicYearId, calendarDate);
  await ensureSubjectAllocation(academicYearId, data.standardId, data.subjectId);
  await ensurePeriod(academicYearId, data.periodId, calendarDate);

  return prisma.dateSpecificTimetableEntry.create({
    data: {
      academicYearId,
      calendarDate,
      periodId: data.periodId,
      standardId: data.standardId,
      subjectId: data.subjectId,
      attendanceRequired: data.attendanceRequired !== false,
    },
    include: { period: true, standard: true, subject: true },
  });
};

export const update = async (id, data) => {
  const existing = await prisma.dateSpecificTimetableEntry.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Date-specific timetable entry not found');

  const academicYearId = existing.academicYearId;
  const year = await ensureYear(academicYearId);
  const calendarDate = data.calendarDate
    ? ensureDateInYear(year, data.calendarDate)
    : normalizeDate(existing.calendarDate);
  const periodId = data.periodId ?? existing.periodId;
  const standardId = data.standardId ?? existing.standardId;
  const subjectId = data.subjectId ?? existing.subjectId;

  await ensureWorkingDate(academicYearId, calendarDate);
  await ensureSubjectAllocation(academicYearId, standardId, subjectId);
  await ensurePeriod(academicYearId, periodId, calendarDate);

  return prisma.dateSpecificTimetableEntry.update({
    where: { id },
    data: {
      calendarDate,
      periodId,
      standardId,
      subjectId,
      ...(data.attendanceRequired !== undefined
        ? { attendanceRequired: Boolean(data.attendanceRequired) }
        : {}),
    },
    include: { period: true, standard: true, subject: true },
  });
};

export const remove = async (id) => {
  const existing = await prisma.dateSpecificTimetableEntry.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Date-specific timetable entry not found');

  const attendanceCount = await prisma.attendanceSession.count({
    where: { dateTimetableEntryId: id },
  });
  if (attendanceCount) {
    throw new ApiError(409, 'Cannot delete a date-specific timetable entry already used by attendance');
  }

  return prisma.dateSpecificTimetableEntry.delete({ where: { id } });
};

export default { list, create, update, remove };
