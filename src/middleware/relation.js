import prisma from '../lib/prisma.js';

export const requireAttendanceSessionStaffRelation = async (req, res, next) => {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: req.params.sessionId },
  });

  if (!session) {
    return res.status(404).json({ message: 'Attendance session not found' });
  }

  // req.user.id is User.id — we need Staff.id
  const staff = await prisma.staff.findUnique({
    where: { userId: req.user.id },
  });

  if (!staff || session.staffId !== staff.id) {
    throw new ApiError(403, 'You are not assigned to this attendance session');
  }

  req.attendanceSession = session;
  next();
};