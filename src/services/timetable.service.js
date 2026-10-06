import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const normalizeWeekday = (value) => {
  const day = String(value).toUpperCase();
  if (!WEEKDAYS.includes(day)) throw new ApiError(400, 'Invalid weekday');
  return day;
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

const ensurePeriodMatches = async (academicYearId, periodId, weekday) => {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.academicYearId !== academicYearId) {
    throw new ApiError(400, 'Period does not belong to the academic year');
  }
  if (period.weekday !== weekday) {
    throw new ApiError(400, 'Period weekday does not match timetable weekday');
  }
  return period;
};

export const list = async (academicYearId, standardId) =>
  prisma.timetableEntry.findMany({
    where: { academicYearId, ...(standardId ? { standardId } : {}) },
    include: { standard: true, subject: true, period: true },
    orderBy: [{ weekday: 'asc' }, { period: { periodIndex: 'asc' } }],
  });

export const create = async ({
  academicYearId,
  standardId,
  weekday,
  periodId,
  subjectId,
  attendanceRequired = true,
}) => {
  const day = normalizeWeekday(weekday);

  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new ApiError(404, 'Academic year not found');

  await ensurePeriodMatches(academicYearId, periodId, day);
  await ensureSubjectAllocation(academicYearId, standardId, subjectId);

  const weeklyHoliday = await prisma.weeklyHoliday.findUnique({
    where: {
      academicYearId_weekday: {
        academicYearId,
        weekday: day,
      },
    },
  });

  if (weeklyHoliday) {
    throw new ApiError(
      409,
      'This weekday is a weekly holiday. Use a date-specific timetable for a special working date.'
    );
  }

  return prisma.timetableEntry.create({
    data: {
      academicYearId,
      standardId,
      weekday: day,
      periodId,
      subjectId,
      attendanceRequired: Boolean(attendanceRequired),
    },
    include: { standard: true, subject: true, period: true },
  });
};

export const update = async (id, data) => {
  const existing = await prisma.timetableEntry.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Timetable entry not found');

  const weekday = data.weekday !== undefined
    ? normalizeWeekday(data.weekday)
    : existing.weekday;
  const periodId = data.periodId ?? existing.periodId;
  const standardId = data.standardId ?? existing.standardId;
  const subjectId = data.subjectId ?? existing.subjectId;

  await ensurePeriodMatches(existing.academicYearId, periodId, weekday);
  await ensureSubjectAllocation(existing.academicYearId, standardId, subjectId);

  const weeklyHoliday = await prisma.weeklyHoliday.findUnique({
    where: {
      academicYearId_weekday: {
        academicYearId: existing.academicYearId,
        weekday,
      },
    },
  });
  if (weeklyHoliday) {
    throw new ApiError(
      409,
      'This weekday is a weekly holiday. Use a date-specific timetable for special working dates.'
    );
  }

  return prisma.timetableEntry.update({
    where: { id },
    data: {
      weekday,
      periodId,
      standardId,
      subjectId,
      ...(data.attendanceRequired !== undefined
        ? { attendanceRequired: Boolean(data.attendanceRequired) }
        : {}),
    },
    include: { standard: true, subject: true, period: true },
  });
};

export const remove = async (id) => {
  const existing = await prisma.timetableEntry.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Timetable entry not found');

  const attendanceCount = await prisma.attendanceSession.count({
    where: { timetableEntryId: id },
  });
  if (attendanceCount) {
    throw new ApiError(409, 'Cannot delete a timetable entry already used by attendance');
  }

  return prisma.timetableEntry.delete({ where: { id } });
};

export const validate = async (academicYearId) => {
  const [entries, requirements, weeklyHolidays] = await Promise.all([
    prisma.timetableEntry.findMany({
      where: { academicYearId },
      include: { subject: true, standard: true, period: true },
    }),
    prisma.subjectPeriodRequirement.findMany({
      where: { academicYearId },
      include: { subject: true, standard: true },
    }),
    prisma.weeklyHoliday.findMany({ where: { academicYearId } }),
  ]);

  const counts = new Map();
  for (const entry of entries) {
    const key = `${entry.standardId}:${entry.subjectId}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const errors = [];

  for (const requirement of requirements) {
    const actual =
      counts.get(`${requirement.standardId}:${requirement.subjectId}`) || 0;

    if (actual !== requirement.requiredPeriodsPerWeek) {
      errors.push({
        type: 'SUBJECT_PERIOD_COUNT',
        standardId: requirement.standardId,
        subjectId: requirement.subjectId,
        required: requirement.requiredPeriodsPerWeek,
        actual,
      });
    }
  }

  const blocked = new Set(weeklyHolidays.map((x) => x.weekday));
  const invalid = entries.filter((entry) => blocked.has(entry.weekday));
  if (invalid.length) {
    errors.push({
      type: 'WEEKLY_HOLIDAY_ENTRIES',
      count: invalid.length,
      message: 'Normal timetable entries cannot be placed on weekly holidays.',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    entries: entries.length,
  };
};

export const publish = async (academicYearId) => {
  const result = await validate(academicYearId);
  if (!result.valid) {
    throw new ApiError(409, 'Timetable validation failed', result.errors);
  }

  return {
    academicYearId,
    published: true,
    publishedAt: new Date().toISOString(),
  };
};

export const WEEKDAY_NAMES = WEEKDAYS;
export const holidayTypes = new Set(['HOLIDAY', 'VACATION']);
