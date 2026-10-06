import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

const map = {
  standard: ['standard', 'Standards'],
  subject: ['subject', 'Subjects'],
  student: ['student', 'Students'],
  user: ['user', 'Users'],
  absenceType: ['studentAbsenceType', 'Absence types'],
};

export const list = async (model, opts = {}) => prisma[model].findMany(opts);

export const find = async (model, id, opts = {}) => {
  const x = await prisma[model].findUnique({ where: { id }, ...opts });
  if (!x) throw new ApiError(404, 'Record not found');
  return x;
};

// ✅ Add default export for convenience
export default {
  list,
  find,
};