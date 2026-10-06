import { Router } from 'express';
import * as c from '../controllers/period.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import asyncHandler from '../utils/async-handler.js';

const r = Router();

r.get(
  '/academic-year/:academicYearId',
  authenticate,
  requirePermission(P.PERIOD_VIEW),
  asyncHandler(c.list)
);

r.post(
  '/academic-year/:academicYearId/generate',
  authenticate,
  requirePermission(P.PERIOD_CREATE),
  asyncHandler(c.generate)
);

r.get('/:id', authenticate, requirePermission(P.PERIOD_VIEW), asyncHandler(c.get));
r.post(
  '/academic-year/:academicYearId',
  authenticate,
  requirePermission(P.PERIOD_CREATE),
  asyncHandler(c.create)
);
r.patch('/:id', authenticate, requirePermission(P.PERIOD_UPDATE), asyncHandler(c.update));
r.delete('/:id', authenticate, requirePermission(P.PERIOD_DELETE), asyncHandler(c.remove));

export default r;
