import prisma from '../lib/prisma.js';

export const logAttendance = (data, tx = prisma) =>
  tx.attendanceAuditLog.create({ data });