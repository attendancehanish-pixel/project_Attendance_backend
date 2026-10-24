import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BULK_ROWS = 500;

const clean = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};

/**
 * Validate and normalise the submitted rows. Returns { rows, errors } where
 * errors is a list of { row, field, message } so the UI can point at the
 * exact row that needs fixing.
 */
const normalizeRows = (input) => {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ApiError(400, 'students must be a non-empty array');
  }
  if (input.length > MAX_BULK_ROWS) {
    throw new ApiError(400, `You can create at most ${MAX_BULK_ROWS} students at a time`);
  }

  const errors = [];
  const seen = new Map();
  const rows = input.map((raw, index) => {
    const rowNo = index + 1;
    const admissionNo = String(raw?.admissionNo ?? '').trim();
    const name = String(raw?.name ?? '').trim().replace(/\s+/g, ' ');
    const email = clean(raw?.email)?.toLowerCase() ?? null;
    const phone = clean(raw?.phone);

    if (!admissionNo) errors.push({ row: rowNo, field: 'admissionNo', message: 'Admission number is required' });
    if (!name) errors.push({ row: rowNo, field: 'name', message: 'Name is required' });
    if (email && !EMAIL_RE.test(email)) errors.push({ row: rowNo, field: 'email', message: 'Invalid email address' });
    if (phone && !/^[0-9+()\-\s]{6,20}$/.test(phone)) errors.push({ row: rowNo, field: 'phone', message: 'Invalid phone number' });

    if (admissionNo) {
      const key = admissionNo.toUpperCase();
      if (seen.has(key)) {
        errors.push({ row: rowNo, field: 'admissionNo', message: `Duplicate of row ${seen.get(key)}` });
      } else {
        seen.set(key, rowNo);
      }
    }
    return { admissionNo, name, email, phone };
  });

  return { rows, errors };
};

export const bulkCreate = async (students) => {
  const { rows, errors } = normalizeRows(students);

  // Case-insensitive duplicate check against existing students.
  const existing = await prisma.student.findMany({
    where: { OR: rows.filter((r) => r.admissionNo).map((r) => ({ admissionNo: { equals: r.admissionNo, mode: 'insensitive' } })) },
    select: { admissionNo: true, name: true },
  });
  const existingMap = new Map(existing.map((s) => [s.admissionNo.toUpperCase(), s]));
  rows.forEach((r, i) => {
    const hit = existingMap.get(r.admissionNo.toUpperCase());
    if (hit) {
      errors.push({
        row: i + 1,
        field: 'admissionNo',
        message: `Admission number already belongs to ${hit.name}`,
      });
    }
  });

  if (errors.length) {
    throw new ApiError(409, `${new Set(errors.map((e) => e.row)).size} row(s) need attention`, { errors });
  }

  const created = await prisma.$transaction(
    rows.map((r) => prisma.student.create({ data: { ...r, status: 'ACTIVE' } }))
  );
  return { count: created.length, data: created };
};

/** Used by the Students page for server-side search. */
export const search = async ({ q, status }) => {
  const where = {};
  if (status) where.status = String(status).toUpperCase();
  if (q?.trim()) {
    const value = q.trim();
    where.OR = [
      { admissionNo: { contains: value, mode: 'insensitive' } },
      { name: { contains: value, mode: 'insensitive' } },
    ];
  }
  return prisma.student.findMany({ where, orderBy: { admissionNo: 'asc' } });
};

export default { bulkCreate, search };
