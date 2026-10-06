// src/controllers/attendance.leave.controller.js
import * as service from '../services/attendance.leave.service.js';

/**
 * GET /api/attendance/leave/sessions
 * Admin dashboard: list all STAFF_LEAVE sessions
 */
export const listLeaveSessions = async (req, res) => {
  const { from, to, standardId, staffId, academicYearId } = req.query;

  res.json({
    data: await service.listStaffLeaveSessions({
      from,
      to,
      standardId,
      staffId,
      academicYearId,
    }),
  });
};

/**
 * POST /api/attendance/leave/sessions/:sessionId/mark
 * Admin or substitute staff marks a STAFF_LEAVE session.
 */
export const markLeaveSessionAttendance = async (req, res) => {
  const { sessionId } = req.params;
  const records = req.body.records || [];

  res.json({
    data: await service.markStaffLeaveAttendance({
      sessionId,
      actorUserId: req.user.id,
      records,
    }),
  });
};

/**
 * POST /api/attendance/leave/mark-session
 * Explicitly mark one session as STAFF_LEAVE (admin action).
 */
export const markSessionAsLeave = async (req, res) => {
  const { sessionId, leaveId, reason } = req.body;

  res.json({
    data: await service.markSessionAsStaffLeave({
      sessionId,
      leaveId,
      reason,
      performedById: req.user.id,
    }),
  });
};

/**
 * POST /api/attendance/leave/bulk-mark
 * Bulk mark all PENDING sessions for a staff between dates.
 * Typically called when a StaffLeave is approved.
 */
export const bulkMarkLeaveSessions = async (req, res) => {
  const {
    staffId,
    from,
    to,
    academicYearId,
    leaveId,
    reason,
  } = req.body;

  res.json({
    data: await service.markStaffLeaveSessions({
      staffId,
      from,
      to,
      academicYearId,
      leaveId,
      performedById: req.user.id,
      reason,
    }),
  });
};