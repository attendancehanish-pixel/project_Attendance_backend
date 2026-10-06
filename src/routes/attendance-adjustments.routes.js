import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import asyncHandler from '../utils/async-handler.js';
import * as controller from '../controllers/attendance-adjustment.controller.js';

const router = Router();

router.post(
  '/',
  authenticate,
  requirePermission(P.ATTENDANCE_ADJUST),
  asyncHandler(controller.create),
);

router.get(
  '/students/:studentId',
  authenticate,
  requirePermission(P.ATTENDANCE_ADJUST),
  asyncHandler(controller.listForStudent),
);

export default router;
