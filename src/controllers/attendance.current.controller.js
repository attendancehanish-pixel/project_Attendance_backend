import { getCurrentAttendance as getCurrentAttendanceService } from '../services/attendance.current.service.js';

export const getCurrentAttendance = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const data = await getCurrentAttendanceService(userId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
