// src/routes/attendance.leave.routes.js
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import * as ctrl from '../controllers/attendance.leave.controller.js';
import asyncHandler from '../utils/async-handler.js';

const router = Router();

/**
 * List all sessions currently in STAFF_LEAVE state.
 * Accessible to any user with ATTENDANCE_VIEW (or restrict to ADMIN).
 */
router.get(
  '/sessions',
  authenticate,
  requirePermission(P.ATTENDANCE_VIEW),
  asyncHandler(ctrl.listLeaveSessions)
);

/**
 * Mark attendance on a STAFF_LEAVE session.
 * Permission: ATTENDANCE_MARK (service further restricts to substitute/admin).
 */
router.post(
  '/sessions/:sessionId/mark',
  authenticate,
  requirePermission(P.ATTENDANCE_MARK),
  asyncHandler(ctrl.markLeaveSessionAttendance)
);

/**
 * Explicitly set a session to STAFF_LEAVE.
 * Admin-only.
 */
router.post(
  '/mark-session',
  authenticate,
  requirePermission(P.ATTENDANCE_MARK),
  asyncHandler(ctrl.markSessionAsLeave)
);

/**
 * Bulk mark all PENDING sessions for a staff between dates.
 * Admin-only. Hook this into StaffLeave approval.
 */
router.post(
  '/bulk-mark',
  authenticate,
  requirePermission(P.ATTENDANCE_MARK),
  asyncHandler(ctrl.bulkMarkLeaveSessions)
);

export default router;