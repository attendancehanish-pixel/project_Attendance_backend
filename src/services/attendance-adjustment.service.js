import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

const parsePoints = (value) => {
  if (value === undefined || value === null || value === '') {
    throw new ApiError(400, 'points is required');
  }

  const points = Number(value);
  if (!Number.isFinite(points)) throw new ApiError(400, 'points must be a valid number');
  if (points === 0) throw new ApiError(400, 'points cannot be zero');
  if (Math.abs(points) > 100) throw new ApiError(400, 'points must be between -100 and 100');

  return points;
};

export const create = async ({
  studentId,
  academicYearId,
  points,
  reason,
  activityTypeId,
  createdById,
}) => {
  if (!studentId || !academicYearId) {
    throw new ApiError(400, 'studentId and academicYearId are required');
  }
  if (!String(reason || '').trim()) {
    throw new ApiError(400, 'Adjustment reason is required');
  }

  const numericPoints = parsePoints(points);

  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.studentEnrollment.findUnique({
      where: {
        studentId_academicYearId: {
          studentId,
          academicYearId,
        },
      },
    });

    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw new ApiError(400, 'Student is not actively enrolled in this academic year');
    }

    const adjustment = await tx.attendanceAdjustment.create({
      data: {
        studentId,
        academicYearId,
        points: numericPoints,
        reason: String(reason).trim(),
        activityTypeId: activityTypeId || null,
        createdById,
      },
      include: { student: true, academicYear: true },
    });

    await tx.attendanceAuditLog.create({
      data: {
        action: 'ATTENDANCE_ADJUSTED',
        performedById: createdById,
        reason: String(reason).trim(),
        metadata: JSON.stringify({
          adjustmentId: adjustment.id,
          studentId,
          academicYearId,
          points: numericPoints,
          activityTypeId: activityTypeId || null,
        }),
      },
    });

    return adjustment;
  });
};

export const listForStudent = async ({ studentId, academicYearId }) => {
  const where = { studentId };
  if (academicYearId) where.academicYearId = academicYearId;

  return prisma.attendanceAdjustment.findMany({
    where,
    include: { academicYear: true, createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export default { create, listForStudent };
