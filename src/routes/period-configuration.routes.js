import { Router } from 'express';
import * as c from '../controllers/period-configuration.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import asyncHandler from '../utils/async-handler.js';

const r = Router();
r.post(
  '/academic-year/:academicYearId/generate',
  authenticate,// or P.PERIOD_CREATE, whatever you use
  asyncHandler(c.generate)
);

r.get(
  '/:academicYearId',
  authenticate,
  requirePermission(P.PERIOD_VIEW),
  asyncHandler(c.get)
);

r.get(
  '/:academicYearId/setup',
  authenticate,
  requirePermission(P.PERIOD_VIEW),
  asyncHandler(c.getSetup)
);

r.put(
  '/:academicYearId',
  authenticate,
  requirePermission(P.PERIOD_UPDATE),
  asyncHandler(c.upsert)
);

export default r;
