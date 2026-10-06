import { Router } from 'express';
import * as c from '../controllers/calendar.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import asyncHandler from '../utils/async-handler.js';

const router = Router();

// Calendar screen
router.get(
  '/academic-year/:academicYearId',
  authenticate,
  requirePermission(P.CALENDAR_VIEW),
  asyncHandler(c.list)
);

router.get(
  '/academic-year/:academicYearId/month',
  authenticate,
  requirePermission(P.CALENDAR_VIEW),
  asyncHandler(c.month)
);

// Date override: one date becomes a working day or holiday.
router.post(
  '/academic-year/:academicYearId/overrides',
  authenticate,
  requirePermission(P.CALENDAR_CREATE),
  asyncHandler(c.createOverride)
);
router.patch(
  '/overrides/:id',
  authenticate,
  requirePermission(P.CALENDAR_UPDATE),
  asyncHandler(c.updateOverride)
);
router.delete(
  '/overrides/:id',
  authenticate,
  requirePermission(P.CALENDAR_DELETE),
  asyncHandler(c.removeOverride)
);

// Admin-defined holiday/exception categories.
router.get(
  '/exception-categories',
  authenticate,
  requirePermission(P.CALENDAR_VIEW),
  asyncHandler(c.listCategories)
);
router.post(
  '/exception-categories',
  authenticate,
  requirePermission(P.CALENDAR_CREATE),
  asyncHandler(c.createCategory)
);
router.patch(
  '/exception-categories/:id',
  authenticate,
  requirePermission(P.CALENDAR_UPDATE),
  asyncHandler(c.updateCategory)
);
router.delete(
  '/exception-categories/:id',
  authenticate,
  requirePermission(P.CALENDAR_DELETE),
  asyncHandler(c.removeCategory)
);

// Full-day or period-range attendance exceptions.
router.get(
  '/academic-year/:academicYearId/exceptions',
  authenticate,
  requirePermission(P.CALENDAR_VIEW),
  asyncHandler(c.listExceptions)
);
router.post(
  '/academic-year/:academicYearId/exceptions',
  authenticate,
  requirePermission(P.CALENDAR_CREATE),
  asyncHandler(c.createException)
);
router.patch(
  '/exceptions/:id',
  authenticate,
  requirePermission(P.CALENDAR_UPDATE),
  asyncHandler(c.updateException)
);
router.delete(
  '/exceptions/:id',
  authenticate,
  requirePermission(P.CALENDAR_DELETE),
  asyncHandler(c.removeException)
);

export default router;
