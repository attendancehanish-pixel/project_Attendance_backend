import { Router } from 'express';
import * as c from '../controllers/date-specific-timetable.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import asyncHandler from '../utils/async-handler.js';

const r = Router();

r.get(
  '/academic-year/:academicYearId',
  authenticate,
  requirePermission(P.TIMETABLE_VIEW),
  asyncHandler(c.list)
);

r.post(
  '/academic-year/:academicYearId',
  authenticate,
  requirePermission(P.TIMETABLE_CREATE),
  asyncHandler(c.create)
);

r.patch('/:id', authenticate, requirePermission(P.TIMETABLE_UPDATE), asyncHandler(c.update));
r.delete('/:id', authenticate, requirePermission(P.TIMETABLE_DELETE), asyncHandler(c.remove));

export default r;
