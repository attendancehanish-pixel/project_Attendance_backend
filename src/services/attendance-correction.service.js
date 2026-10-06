import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

export const request = async ({
  attendanceRecordId,
  newStatus,
  newAbsenceTypeId,
  reason,
  requestedById,
}) => {
  const r = await prisma.studentAttendance.findUnique({
    where: { id: attendanceRecordId },
  });
  if (!r) throw new ApiError(404, 'Attendance record not found');

  return prisma.attendanceCorrection.create({
    data: {
      attendanceRecordId,
      oldStatus: r.status,
      newStatus,
      oldAbsenceTypeId: r.absenceTypeId,
      newAbsenceTypeId: newAbsenceTypeId || null,
      reason,
      requestedById,
    },
  });
};

export const approve = async (id, reviewedById) =>
  prisma.$transaction(async (tx) => {
    const c = await tx.attendanceCorrection.findUnique({ where: { id } });
    if (!c) throw new ApiError(404, 'Correction not found');
    if (c.status !== 'PENDING') {
      throw new ApiError(409, 'Correction already reviewed');
    }

    const record = await tx.studentAttendance.update({
      where: { id: c.attendanceRecordId },
      data: {
        status: c.newStatus,
        absenceTypeId: c.newStatus === 'ABSENT' ? c.newAbsenceTypeId : null,
      },
    });

    await tx.attendanceCorrection.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: reviewedById,
        reviewedAt: new Date(),
      },
    });

    await tx.attendanceAuditLog.create({
      data: {
        attendanceRecordId: record.id,
        action: 'ATTENDANCE_CORRECTED',
        oldStatus: c.oldStatus,
        newStatus: c.newStatus,
        oldAbsenceTypeId: c.oldAbsenceTypeId,
        newAbsenceTypeId: c.newAbsenceTypeId,
        performedById: reviewedById,
        reason: c.reason,
      },
    });

    return record;
  });

export const reject = async (id, reviewedById) =>
  prisma.attendanceCorrection.update({
    where: { id },
    data: { status: 'REJECTED', reviewedById, reviewedAt: new Date() },
  });

// ✅ Add default export for convenience
export default {
  request,
  approve,
  reject,
};