// src/services/attendance.leave.service.js
import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { endOfDay, parseSchoolDateStrict } from '../utils/date.js';

/**
 * Update a single attendance session's status to STAFF_LEAVE
 */
export const markSessionAsStaffLeave = async ({
  sessionId,
  leaveId,
  reason = null,
  performedById,
}) =>
  prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new ApiError(404, 'Attendance session not found');
    }

    if (session.sessionStatus === 'MARKED') {
      throw new ApiError(
        409,
        'Cannot mark as STAFF_LEAVE: attendance already marked'
      );
    }

    const updated = await tx.attendanceSession.update({
      where: { id: sessionId },
      data: { sessionStatus: 'STAFF_LEAVE' },
      include: {
        standard: true,
        subject: true,
        period: true,
        staff: { include: { user: true } },
      },
    });

    await tx.attendanceAuditLog.create({
      data: {
        action: 'SESSION_MARKED_STAFF_LEAVE',
        newStatus: 'STAFF_LEAVE',
        performedById,
        reason,
        metadata: JSON.stringify({ leaveId, sessionId }),
      },
    });

    return updated;
  });

/**
 * Bulk update all sessions for a staff between two dates to STAFF_LEAVE
 * Called when a StaffLeave is approved.
 */
export const markStaffLeaveSessions = async ({
  staffId,
  from,
  to,
  academicYearId,
  leaveId,
  performedById,
  reason = null,
}) =>
  prisma.$transaction(async (tx) => {
    const start = parseSchoolDateStrict(from, 'from');
    const end = endOfDay(parseSchoolDateStrict(to, 'to'));

    // Only touch PENDING sessions — never override MARKED ones
    const sessions = await tx.attendanceSession.findMany({
      where: {
        staffId,
        academicYearId,
        attendanceDate: { gte: start, lte: end },
        sessionStatus: 'PENDING',
      },
      select: { id: true },
    });

    if (sessions.length === 0) {
      return { updatedCount: 0, sessionIds: [] };
    }

    const sessionIds = sessions.map((s) => s.id);

    await tx.attendanceSession.updateMany({
      where: { id: { in: sessionIds } },
      data: { sessionStatus: 'STAFF_LEAVE' },
    });

    // Audit log per session
    await tx.attendanceAuditLog.createMany({
      data: sessionIds.map((id) => ({
        action: 'SESSION_MARKED_STAFF_LEAVE',
        newStatus: 'STAFF_LEAVE',
        performedById,
        reason,
        metadata: JSON.stringify({ leaveId, sessionId: id }),
      })),
    });

    return { updatedCount: sessionIds.length, sessionIds };
  });

/**
 * List all sessions currently in STAFF_LEAVE state
 * (for admin dashboard to pick up and mark)
 */
export const listStaffLeaveSessions = async ({
  from,
  to,
  standardId,
  staffId,
  academicYearId,
} = {}) => {
  const where = {
    sessionStatus: 'STAFF_LEAVE',
    ...(staffId ? { staffId } : {}),
    ...(standardId ? { standardId } : {}),
    ...(academicYearId ? { academicYearId } : {}),
  };

  if (from || to) {
    where.attendanceDate = {};
    if (from) where.attendanceDate.gte = parseSchoolDateStrict(from, 'from');
    if (to) where.attendanceDate.lte = endOfDay(parseSchoolDateStrict(to, 'to'));
  }

  const sessions = await prisma.attendanceSession.findMany({
    where,
    include: {
      standard: true,
      subject: true,
      period: true,
      staff: { include: { user: true } },
      // substitute info via period substitutions
    },
    orderBy: [{ attendanceDate: 'asc' }, { period: { periodIndex: 'asc' } }],
  });

  // Attach substitute info if available
  const enriched = await Promise.all(
    sessions.map(async (session) => {
      const substitution = await prisma.periodSubstitution.findFirst({
        where: {
          periodId: session.periodId,
          standardId: session.standardId,
          subjectId: session.subjectId,
          substitutionDate: session.attendanceDate,
        },
        include: {
          substituteStaff: { include: { user: true } },
          originalStaff: { include: { user: true } },
        },
      });

      return {
        ...session,
        substitution: substitution || null,
        canBeMarkedBy: substitution
          ? substitution.substituteStaffId
          : 'ADMIN_ONLY',
      };
    })
  );

  return enriched;
};

/**
 * Find the effective marker for a session:
 *  - If a PeriodSubstitution exists for the date/period/standard → substitute staff
 *  - Else → null (admin must mark)
 */
export const resolveSubstituteForSession = async ({ session, tx = prisma }) => {
  return tx.periodSubstitution.findFirst({
    where: {
      periodId: session.periodId,
      standardId: session.standardId,
      subjectId: session.subjectId,
      substitutionDate: session.attendanceDate,
    },
    include: { substituteStaff: true },
  });
};

/**
 * Mark attendance on a STAFF_LEAVE session.
 * Only ADMIN or the substitute staff may do this.
 */
export const markStaffLeaveAttendance = async ({
  sessionId,
  actorUserId,
  records,
}) =>
  prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        academicYear: true,
        standard: true,
        subject: true,
        period: true,
      },
    });

    if (!session) throw new ApiError(404, 'Attendance session not found');

    if (session.sessionStatus !== 'STAFF_LEAVE') {
      throw new ApiError(
        409,
        `Session is not in STAFF_LEAVE state (current: ${session.sessionStatus})`
      );
    }

    const actor = await tx.user.findUnique({
      where: { id: actorUserId },
      include: {
        userRoles: { include: { role: true } },
        staff: true,
      },
    });

    if (!actor) throw new ApiError(404, 'Authenticated user not found');

    const isAdmin = actor.userRoles.some((ur) => ur.role.name === 'ADMIN');

    const substitution = await tx.periodSubstitution.findFirst({
      where: {
        periodId: session.periodId,
        standardId: session.standardId,
        subjectId: session.subjectId,
        substitutionDate: session.attendanceDate,
      },
    });

    const isSubstitute =
      !!substitution &&
      !!actor.staff &&
      substitution.substituteStaffId === actor.staff.id;

    if (!isAdmin && !isSubstitute) {
      throw new ApiError(
        403,
        'Only the substitute staff or an admin can mark this session'
      );
    }

    if (!Array.isArray(records) || records.length === 0) {
      throw new ApiError(400, 'Attendance records are required');
    }

    const enrollments = await tx.studentEnrollment.findMany({
      where: {
        academicYearId: session.academicYearId,
        standardId: session.standardId,
        status: 'ACTIVE',
      },
      select: { id: true, studentId: true },
    });

    if (enrollments.length === 0) {
      throw new ApiError(400, 'No active students found for this class');
    }

    const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));
    const enrollmentByStudentId = new Map(
      enrollments.map((e) => [e.studentId, e])
    );

    const normalizedRecords = records.map((record) => {
      const enrollment = record.enrollmentId
        ? enrollmentById.get(record.enrollmentId)
        : record.studentId
          ? enrollmentByStudentId.get(record.studentId)
          : null;

      if (!enrollment) {
        throw new ApiError(
          400,
          record.enrollmentId
            ? `Enrollment ${record.enrollmentId} does not belong to this class`
            : `Student ${record.studentId} does not belong to this class`
        );
      }

      return {
        enrollmentId: enrollment.id,
        status: record.status,
        absenceTypeId:
          record.status === 'ABSENT' ? record.absenceTypeId : null,
      };
    });

    const submittedEnrollmentIds = normalizedRecords.map(
      (r) => r.enrollmentId
    );

    if (
      new Set(submittedEnrollmentIds).size !==
      submittedEnrollmentIds.length
    ) {
      throw new ApiError(400, 'Duplicate student attendance records');
    }

    if (normalizedRecords.length !== enrollments.length) {
      throw new ApiError(
        400,
        'Attendance must be submitted for all students'
      );
    }

    const absenceTypeIds = [
      ...new Set(
        normalizedRecords
          .filter((r) => r.status === 'ABSENT')
          .map((r) => r.absenceTypeId)
      ),
    ];

    if (normalizedRecords.some((r) => !['PRESENT', 'ABSENT'].includes(r.status))) {
      throw new ApiError(400, 'Invalid attendance status');
    }

    if (absenceTypeIds.length) {
      const validTypes = await tx.studentAbsenceType.findMany({
        where: { id: { in: absenceTypeIds }, isActive: true },
        select: { id: true },
      });

      if (validTypes.length !== absenceTypeIds.length) {
        throw new ApiError(400, 'Invalid or inactive absence type');
      }
    }

    const existing = await tx.studentAttendance.count({
      where: { attendanceSessionId: sessionId },
    });

    if (existing > 0) {
      throw new ApiError(
        409,
        'Attendance has already been marked for this session'
      );
    }

    for (const record of normalizedRecords) {
      const attendance = await tx.studentAttendance.create({
        data: {
          attendanceSessionId: sessionId,
          enrollmentId: record.enrollmentId,
          status: record.status,
          absenceTypeId: record.absenceTypeId,
          markedById: actorUserId,
        },
      });

      await tx.attendanceAuditLog.create({
        data: {
          attendanceRecordId: attendance.id,
          action: 'ATTENDANCE_MARKED_ON_LEAVE',
          newStatus: record.status,
          newAbsenceTypeId: record.absenceTypeId,
          performedById: actorUserId,
          metadata: JSON.stringify({
            markedOnBehalfOf: session.staffId,
            isAdmin,
            isSubstitute,
            substitutionId: substitution?.id || null,
          }),
        },
      });
    }

    await tx.attendanceSession.update({
      where: { id: sessionId },
      data: { sessionStatus: 'MARKED' },
    });

    return tx.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        records: {
          include: {
            enrollment: { include: { student: true, standard: true } },
            absenceType: true,
          },
        },
        standard: true,
        subject: true,
        period: true,
        staff: { include: { user: true } },
      },
    });
  });

export default {
  markSessionAsStaffLeave,
  markStaffLeaveSessions,
  listStaffLeaveSessions,
  resolveSubstituteForSession,
  markStaffLeaveAttendance,
};