import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

export const get = async (academicYearId) => {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new ApiError(404, 'Academic year not found');
  return prisma.timetableSetting.upsert({
    where: { academicYearId },
    update: {},
    create: { academicYearId },
  });
};

export const update = async (academicYearId, data) => {
  const value = data.excludeWeeklyHolidaysFromTimetable;
  if (value === undefined) throw new ApiError(400, 'excludeWeeklyHolidaysFromTimetable is required');
  return prisma.timetableSetting.upsert({
    where: { academicYearId },
    update: { excludeWeeklyHolidaysFromTimetable: Boolean(value) },
    create: { academicYearId, excludeWeeklyHolidaysFromTimetable: Boolean(value) },
  });
};
