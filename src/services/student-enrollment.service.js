import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

const VALID_STATUSES = new Set([
  'PROMOTED',
  'GRADUATED',
  'WITHDRAWN',
  'ENROLLED',
  'ACTIVE',
]);

const normalizeDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'Invalid date');
  }
  return date;
};

const validateStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (!VALID_STATUSES.has(normalized)) {
    throw new ApiError(
      400,
      'Invalid enrollment status. Use PROMOTED, GRADUATED, WITHDRAWN, or ENROLLED.'
    );
  }
  return normalized === 'ACTIVE' ? 'ENROLLED' : normalized;
};

const getAcademicYearAndStandard = async (academicYearId, standardId) => {
  const [academicYear, standard] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: academicYearId } }),
    prisma.standard.findUnique({ where: { id: standardId } }),
  ]);

  if (!academicYear) throw new ApiError(404, 'Academic year not found');
  if (!standard) throw new ApiError(404, 'Standard not found');

  return { academicYear, standard };
};

const studentSelect = {
  id: true,
  admissionNo: true,
  name: true,
  email: true,
  phone: true,
  status: true,
};

const enrollmentInclude = {
  student: { select: studentSelect },
  academicYear: {
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  },
  standard: { select: { id: true, code: true, name: true } },
};

export const list = async ({ academicYearId, standardId, status, search }) => {
  if (!academicYearId) {
    throw new ApiError(400, 'academicYearId is required');
  }

  const where = { academicYearId };

  if (standardId) where.standardId = standardId;
  if (status) where.status = validateStatus(status);

  if (search?.trim()) {
    const value = search.trim();
    where.student = {
      OR: [
        { admissionNo: { contains: value, mode: 'insensitive' } },
        { name: { contains: value, mode: 'insensitive' } },
      ],
    };
  }

  return prisma.studentEnrollment.findMany({
    where,
    include: enrollmentInclude,
    orderBy: [
      { standard: { name: 'asc' } },
      { rollNo: 'asc' },
    ],
  });
};

export const getById = async (id) =>
  prisma.studentEnrollment.findUniqueOrThrow({
    where: { id },
    include: enrollmentInclude,
  });

const validateInputRows = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError(400, 'enrollments must be a non-empty array');
  }

  const seenAdmissionNos = new Set();
  const seenRollNos = new Set();

  return rows.map((row, index) => {
    const admissionNo = String(row?.admissionNo || '').trim();
    const rollNo = String(row?.rollNo || '').trim();

    if (!admissionNo || !rollNo) {
      throw new ApiError(400, `Row ${index + 1}: admissionNo and rollNo are required`);
    }

    const admissionKey = admissionNo.toUpperCase();
    if (seenAdmissionNos.has(admissionKey)) {
      throw new ApiError(400, `Row ${index + 1}: duplicate admission number in this submission`);
    }
    seenAdmissionNos.add(admissionKey);

    if (seenRollNos.has(rollNo)) {
      throw new ApiError(400, `Row ${index + 1}: duplicate roll number in this submission`);
    }
    seenRollNos.add(rollNo);

    return { admissionNo, rollNo };
  });
};

export const bulkEnroll = async ({ academicYearId, standardId, status, enrollments }) => {
  if (!academicYearId || !standardId) {
    throw new ApiError(400, 'academicYearId and standardId are required');
  }

  const normalizedStatus = validateStatus(status);
  const rows = validateInputRows(enrollments);
  await getAcademicYearAndStandard(academicYearId, standardId);

  const admissionNos = rows.map((row) => row.admissionNo);
  const rollNos = rows.map((row) => row.rollNo);

  const [students, existingByStudent, existingByRoll] = await Promise.all([
    prisma.student.findMany({
      where: { admissionNo: { in: admissionNos } },
      select: studentSelect,
    }),
    prisma.studentEnrollment.findMany({
      where: {
        academicYearId,
        student: { admissionNo: { in: admissionNos } },
      },
      include: { student: { select: { admissionNo: true, name: true } } },
    }),
    prisma.studentEnrollment.findMany({
      where: { academicYearId, standardId, rollNo: { in: rollNos } },
      include: { student: { select: { admissionNo: true, name: true } } },
    }),
  ]);

  const studentByAdmissionNo = new Map(students.map((student) => [student.admissionNo.toUpperCase(), student]));
  const existingStudentMap = new Map(
    existingByStudent.map((enrollment) => [enrollment.student.admissionNo.toUpperCase(), enrollment])
  );
  const existingRollMap = new Map(existingByRoll.map((enrollment) => [enrollment.rollNo, enrollment]));

  const missingStudents = [];
  const conflicts = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const student = studentByAdmissionNo.get(row.admissionNo.toUpperCase());

    if (!student) {
      missingStudents.push({ row: index + 1, admissionNo: row.admissionNo });
      continue;
    }

    const existingStudent = existingStudentMap.get(student.admissionNo.toUpperCase());
    if (existingStudent) {
      conflicts.push({
        row: index + 1,
        admissionNo: row.admissionNo,
        reason: `Student is already enrolled in ${existingStudent.academicYearId === academicYearId ? 'this academic year' : 'the selected academic year'}`,
      });
      continue;
    }

    const existingRoll = existingRollMap.get(row.rollNo);
    if (existingRoll) {
      conflicts.push({
        row: index + 1,
        admissionNo: row.admissionNo,
        rollNo: row.rollNo,
        reason: `Roll number is already assigned to ${existingRoll.student.admissionNo} (${existingRoll.student.name})`,
      });
    }
  }

  if (missingStudents.length || conflicts.length) {
    throw new ApiError(409, 'Enrollment validation failed', {
      missingStudents,
      conflicts,
    });
  }

  const created = await prisma.$transaction(
    rows.map((row) => {
      const student = studentByAdmissionNo.get(row.admissionNo.toUpperCase());
      return prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicYearId,
          standardId,
          rollNo: row.rollNo,
          status: normalizedStatus,
        },
        include: enrollmentInclude,
      });
    })
  );

  return {
    count: created.length,
    data: created,
  };
};

export const update = async (id, data) => {
  const existing = await prisma.studentEnrollment.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Student enrollment not found');

  const updateData = {};
  if (data.status !== undefined) updateData.status = validateStatus(data.status);

  if (data.rollNo !== undefined) {
    const rollNo = String(data.rollNo).trim();
    if (!rollNo) throw new ApiError(400, 'rollNo cannot be empty');

    const conflict = await prisma.studentEnrollment.findFirst({
      where: {
        academicYearId: existing.academicYearId,
        standardId: existing.standardId,
        rollNo,
        id: { not: id },
      },
    });

    if (conflict) throw new ApiError(409, 'This roll number is already assigned in the selected class');
    updateData.rollNo = rollNo;
  }

  if (!Object.keys(updateData).length) {
    throw new ApiError(400, 'Nothing to update');
  }

  return prisma.studentEnrollment.update({
    where: { id },
    data: updateData,
    include: enrollmentInclude,
  });
};

export const remove = async (id) => {
  const existing = await prisma.studentEnrollment.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Student enrollment not found');

  const attendanceCount = await prisma.studentAttendance.count({
    where: { enrollmentId: existing.id },
  });

  if (attendanceCount > 0) {
    throw new ApiError(
      409,
      'This student has attendance history and cannot be unenrolled by deletion. Change the enrollment status instead.'
    );
  }

  return prisma.studentEnrollment.delete({ where: { id } });
};

export const getSetup = async (academicYearId, standardId) => {
  if (!academicYearId || !standardId) {
    throw new ApiError(400, 'academicYearId and standardId are required');
  }

  const { academicYear, standard } = await getAcademicYearAndStandard(academicYearId, standardId);

  const [enrollments, studentCount] = await Promise.all([
    list({ academicYearId, standardId }),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
  ]);

  return {
    academicYear,
    standard,
    studentsAvailable: studentCount,
    enrollments,
  };
};

export default {
  list,
  getById,
  bulkEnroll,
  update,
  remove,
  getSetup,
};
