import { Router } from 'express';
import * as c from '../controllers/attendance-session.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import asyncHandler from '../utils/async-handler.js';
const r = Router();
r.post('/academic-year/:academicYearId/generate', authenticate, requirePermission(P.ATTENDANCE_SESSION_GENERATE), asyncHandler(c.generate));
r.post('/academic-year/:academicYearId/generate-range', authenticate, requirePermission(P.ATTENDANCE_SESSION_GENERATE), asyncHandler(c.generateRange));
r.get(
    '/academic-year/:academicYearId/sessions',
    authenticate,
   
    asyncHandler(c.list)
);
export default r;
