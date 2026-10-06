import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import * as correctionController from '../controllers/attendance-correction.controller.js';
import asyncHandler from '../utils/async-handler.js';

const router = Router();

router.post('/', authenticate, requirePermission(P.ATTENDANCE_CORRECT), asyncHandler(correctionController.request));
router.post('/:id/approve', authenticate, requirePermission(P.ATTENDANCE_APPROVE_CORRECTION), asyncHandler(correctionController.approve));
router.post('/:id/reject', authenticate, requirePermission(P.ATTENDANCE_APPROVE_CORRECTION), asyncHandler(correctionController.reject));

export default router;
