import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import asyncHandler from '../utils/async-handler.js';
import * as attendanceReportController from '../controllers/attendance-report.controller.js';

const router = Router();

// Daily grid: standards x periods, for the "Attendance Dashboard" daily report.
router.get(
  '/attendance/daily',
  authenticate,
  requirePermission(P.REPORTS_ATTENDANCE_VIEW),
  asyncHandler(attendanceReportController.getDailyReport),
);

// Detail behind one grid cell: every student in that session with their status.
router.get(
  '/attendance/sessions/:sessionId',
  authenticate,
  requirePermission(P.REPORTS_ATTENDANCE_VIEW),
  asyncHandler(attendanceReportController.getSessionReport),
);

// All PENDING sessions in a date range — the "unmarked" report. Cheap
// because it reads pre-generated AttendanceSession rows instead of
// recomputing the timetable for every day in the range.
router.get(
  '/attendance/unmarked',
  authenticate,
  requirePermission(P.REPORTS_ATTENDANCE_VIEW),
  asyncHandler(attendanceReportController.getUnmarkedReport),
);

router.get('/attendance', authenticate, requirePermission(P.REPORTS_ATTENDANCE_VIEW), async (req, res) =>
  res.json({ message: 'Attendance report endpoint ready for implementation' }),
);

router.get('/audit', authenticate, requirePermission(P.REPORTS_AUDIT_VIEW), async (req, res) =>
  res.json({ message: 'Audit report endpoint ready for implementation' }),
);

export default router;
