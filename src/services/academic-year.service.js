import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

export const create = async (data) => prisma.$transaction(async (tx) => {
  const year = await tx.academicYear.create({ data });
  await tx.timetableSetting.create({ data: { academicYearId: year.id } });
  await tx.attendanceSetting.create({ data: { academicYearId: year.id } });
  return year;
});

export const update = async (id, data) => {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw new ApiError(404, 'Academic year not found');

  if (y.attendanceStarted && (data.startDate || data.endDate)) {
    throw new ApiError(
      409,
      'Academic year dates cannot be changed after attendance starts'
    );
  }

  return prisma.academicYear.update({ where: { id }, data });
};

export const activate = async (id) =>
  prisma.$transaction(async (tx) => {
    const y = await tx.academicYear.findUnique({ where: { id } });
    if (!y) throw new ApiError(404, 'Academic year not found');

    const active = await tx.academicYear.findFirst({
      where: { status: 'ACTIVE', id: { not: id } },
    });

    if (active) {
      throw new ApiError(409, 'Another academic year is already active');
    }

    return tx.academicYear.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  });

export const complete = async (id) =>
  prisma.academicYear.update({ where: { id }, data: { status: 'COMPLETED' } });

export const list = () =>
  prisma.academicYear.findMany({ orderBy: { startDate: 'desc' } });

// ✅ Add default export for convenience
export default {
  create,
  update,
  activate,
  complete,
  list,
};