import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { startOfDay, endOfDay, businessNow, parseSchoolDateStrict } from '../utils/date.js';
const ALLOWED_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
export const getSession = async (id) =>
  prisma.attendanceSession.findUnique({
    where: { id },
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
      staff: true,
    },
  });

export const mark = async ({ sessionId, staffId, records }) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new ApiError(400, 'Attendance records are required');
  }

  return prisma.$transaction(
    async (tx) => {
      const session = await tx.attendanceSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new ApiError(404, 'Attendance session not found');
      }

      const user = await tx.user.findUnique({
        where: { id: staffId },
        include: {
          userRoles: { include: { role: true } },
          staff: true,
        },
      });

      if (!user) {
        throw new ApiError(404, 'Authenticated user not found');
      }

      const isAdmin = user.userRoles.some((ur) => ur.role.name === 'ADMIN');

      if (!isAdmin) {
        if (!user.staff) {
          throw new ApiError(403, 'Authenticated user is not a staff member');
        }
        if (session.staffId !== user.staff.id) {
          throw new ApiError(403, 'Not assigned to this session');
        }

        const today = businessNow();
        if (
          session.attendanceDate < startOfDay(today) ||
          session.attendanceDate > endOfDay(today)
        ) {
          throw new ApiError(403, 'Attendance can only be marked for today');
        }
      }

      if (session.sessionStatus !== 'PENDING') {
        throw new ApiError(409, 'Attendance session is no longer editable');
      }

      // Attendance belongs to the enrollment, not directly to the student.
      // We keep studentId as a backward-compatible input, but normalize every
      // request to enrollmentId before writing StudentAttendance.
      const enrollments = await tx.studentEnrollment.findMany({
        where: {
          academicYearId: session.academicYearId,
          standardId: session.standardId,
        
        },
        select: {
          id: true,
          studentId: true,
          student: {
            select: { id: true, name: true, admissionNo: true },
          },
        },
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
          absenceTypeId: record.status === 'ABSENT' ? record.absenceTypeId : null,
        };
      });

      const submittedEnrollmentIds = normalizedRecords.map((r) => r.enrollmentId);
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

      for (const record of normalizedRecords) {
        if (!ALLOWED_STATUSES.includes(record.status)) {
          throw new ApiError(400, 'Invalid attendance status');
        }

        if (record.status === 'ABSENT' && !record.absenceTypeId) {
          throw new ApiError(
            400,
            'Absence type is required for absent students'
          );
        }
      }

      const absenceTypeIds = [
        ...new Set(
          normalizedRecords
            .filter((r) => r.status === 'ABSENT')
            .map((r) => r.absenceTypeId)
        ),
      ];

      if (absenceTypeIds.length) {
        const validTypes = await tx.studentAbsenceType.findMany({
          where: { id: { in: absenceTypeIds }, isActive: true },
          select: { id: true },
        });

        if (validTypes.length !== absenceTypeIds.length) {
          throw new ApiError(400, 'Invalid or inactive absence type');
        }
      }

      // Atomic session claim prevents two concurrent marking requests.
      const claimed = await tx.attendanceSession.updateMany({
        where: { id: sessionId, sessionStatus: 'PENDING' },
        data: { sessionStatus: 'MARKED' },
      });

      if (claimed.count === 0) {
        throw new ApiError(
          409,
          'Attendance has already been marked for this session'
        );
      }

      // Create the attendance rows one-by-one so the generated attendance
      // record IDs can be used by the audit log.
      const createdRecords = [];

      for (const record of normalizedRecords) {
        const attendance = await tx.studentAttendance.create({
          data: {
            attendanceSessionId: sessionId,
            enrollmentId: record.enrollmentId,
            status: record.status,
            absenceTypeId: record.absenceTypeId,
            markedById: staffId,
          },
        });

        createdRecords.push(attendance);

        await tx.attendanceAuditLog.create({
          data: {
            attendanceRecordId: attendance.id,
            action: 'ATTENDANCE_MARKED',
            newStatus: record.status,
            newAbsenceTypeId: record.absenceTypeId,
            performedById: staffId,
            metadata: isAdmin
              ? JSON.stringify({ markedByAdmin: true })
              : null,
          },
        });
      }

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
          staff: true,
        },
      });
    },
    { timeout: 15000 }
  );
};

export const listForStaff = async (userId, { cursor, limit } = {}) => {
  const staff = await prisma.staff.findUnique({ where: { userId } });

  if (!staff) throw new ApiError(403, "Authenticated user is not a staff member");

  const take = Math.min(Math.max(Number(limit) || 5, 1), 50);

  const now = businessNow();
  const endOfToday = endOfDay(now);

  const where = {
    staffId: staff.id,
    attendanceDate: cursor
      ? { lte: endOfToday, lt: new Date(cursor) }
      : { lte: endOfToday },
  };

  const rows = await prisma.attendanceSession.findMany({
    where,
    include: { standard: true, subject: true, period: true },
    orderBy: [{ attendanceDate: "desc" }, { id: "desc" }],
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const data = hasMore ? rows.slice(0, take) : rows;

  return {
    data,
    nextCursor:
      hasMore && data.length
        ? data[data.length - 1].attendanceDate.toISOString()
        : null,
    hasMore,
  };
};
// Review is intentionally not restricted to the logged-in staff member.
// Any staff user with ATTENDANCE_VIEW may review all students and subjects.
export const reviewSubjects = async ({ standardId, subjectId, from, to }) => {
  const where = {};
  if (standardId) where.standardId = standardId;
  if (subjectId) where.subjectId = subjectId;
  if (from || to) where.attendanceDate = {};
  if (from) where.attendanceDate.gte = parseSchoolDateStrict(from, 'from');
  if (to) where.attendanceDate.lte = endOfDay(parseSchoolDateStrict(to, 'to'));

  const sessions = await prisma.attendanceSession.findMany({
    where,
    include: {
      standard: true,
      subject: true,
      period: true,
      records: {
        include: {
          enrollment: { include: { student: true } },
          absenceType: true,
        },
      },
    },
    orderBy: [{ attendanceDate: 'desc' }, { period: { periodIndex: 'asc' } }],
  });
  return sessions;
};

export const reviewStudents = async ({ standardId }) => {
  return prisma.student.findMany({
    where: {
      status: 'ACTIVE',
      ...(standardId ? { enrollments: { some: { standardId, status: 'ACTIVE' } } } : {}),
    },
    include: {
      enrollments: { where: { status: 'ACTIVE' }, include: { standard: true } },
    },
    orderBy: { name: 'asc' },
  });
};

export const reviewStudent = async ({ studentId, from, to }) => {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new ApiError(404, 'Student not found');

  const where = {
    enrollment: { studentId },
  };

  if (from || to) where.session = { attendanceDate: {} };
  if (from) {
    where.session.attendanceDate.gte = parseSchoolDateStrict(from, 'from');
  }
  if (to) {
    where.session.attendanceDate.lte = endOfDay(parseSchoolDateStrict(to, 'to'));
  }

  const records = await prisma.studentAttendance.findMany({
    where,
    include: {
      absenceType: true,
      enrollment: {
        include: { student: true, standard: true, academicYear: true },
      },
      session: {
        include: {
          standard: true,
          subject: true,
          period: true,
          staff: { include: { user: true } },
        },
      },
    },
    orderBy: [{ session: { attendanceDate: 'desc' } }],
  });

  return { student, records };
};

export const reviewOptions = async () => {
  const [standards, subjects] = await Promise.all([
    prisma.standard.findMany({ orderBy: { name: 'asc' } }),
    prisma.subject.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return { standards, subjects };
};

export const getStudentsForSession = async (sessionId, userId) => {
  // 1. Load the session with its relations
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: {
      standard: true,
      subject: true,
      period: true,
    },
  });

  if (!session) {
    throw new ApiError(404, "Attendance session not found");
  }

  // 2. Auth check (optional — keep commented if you don't want it yet)
  const staff = await prisma.staff.findUnique({ where: { userId } });

  // if (!staff) {
  //   throw new ApiError(403, "Authenticated user is not a staff member");
  // }
  // if (session.staffId !== staff.id) {
  //   throw new ApiError(403, "You are not assigned to this attendance session");
  // }

  // 3. Fetch active students in this class via enrollments
  //    Include rollNo from the enrollment and any existing attendance record
  //    for THIS session so we can return the actual present/absent state.
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicYearId: session.academicYearId,
      standardId: session.standardId,
   
    },
    include: {
      student: true,
    },
    orderBy: { rollNo: "asc" },
  });

  // 4. Fetch existing attendance records for this session
  const attendanceRecords = await prisma.studentAttendance.findMany({
    where: { attendanceSessionId: sessionId },
  });

  const recordMap = new Map(
    attendanceRecords.map((r) => [r.enrollmentId, r])
  );

  // 5. Shape students exactly how the frontend expects them.
  //    The drawer reads `student.id`, `student.name`, `student.rollNo`,
  //    `student.admissionNo`, `student.status`, `student.absenceTypeId`,
  //    `student.remarks`.
  const students = enrollments.map((enrollment) => {
    const student = enrollment.student;
    const record = recordMap.get(enrollment.id);

    return {
      id: student.id,
      studentId: student.id,
      enrollmentId: enrollment.id,
      name: student.name,
      admissionNo: student.admissionNo,
      rollNo: enrollment.rollNo,

      // Attendance state for THIS session (falls back to PRESENT if unmarked)
      status: record?.status || "unmarked",
      absenceTypeId: record?.absenceTypeId || null,
    };
  });

  // 6. Return everything the frontend needs
  return {
    session,
    students,
    attendanceRecords, // frontend merges this via recordMap
  };
};

// ✅ Add default export for convenience
export default {
  getSession,
  mark,
  listForStaff,
  reviewSubjects,
  reviewStudents,
  reviewStudent,
  reviewOptions,
  getStudentsForSession,
};