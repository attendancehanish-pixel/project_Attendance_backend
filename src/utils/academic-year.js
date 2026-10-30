import prisma from '../lib/prisma.js';
import { businessNow } from './date.js';

/**
 * The academic year the staff portal should work with.
 *
 * Requiring status === "ACTIVE" breaks the portal whenever the admin has not
 * flagged a year as active yet, so fall back in this order:
 *   1. the ACTIVE year
 *   2. the (non-completed) year whose dates contain today
 *   3. the most recent year that has timetable entries
 *   4. the most recent year
 */
export async function getCurrentAcademicYear() {
  const active = await prisma.academicYear.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startDate: 'desc' },
  });
  if (active) return active;

  const now = businessNow();
  const current = await prisma.academicYear.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now }, status: { not: 'COMPLETED' } },
    orderBy: { startDate: 'desc' },
  });
  if (current) return current;

  const withTimetable = await prisma.academicYear.findFirst({
    where: { timetableEntries: { some: {} } },
    orderBy: { startDate: 'desc' },
  });
  if (withTimetable) return withTimetable;

  const latest = await prisma.academicYear.findFirst({ orderBy: { startDate: 'desc' } });
  if (latest) return latest;

  throw new Error('No active academic year found');
}
