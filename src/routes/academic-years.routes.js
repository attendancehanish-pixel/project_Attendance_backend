import { Router } from 'express';
import * as academicYearController from '../controllers/academic-year.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import asyncHandler from '../utils/async-handler.js';

const router = Router();

router.get('/', authenticate, requirePermission(P.ACADEMIC_YEAR_VIEW), asyncHandler(academicYearController.list));
router.post('/', authenticate, requirePermission(P.ACADEMIC_YEAR_CREATE), asyncHandler(academicYearController.create));
router.patch('/:id', authenticate, requirePermission(P.ACADEMIC_YEAR_UPDATE), asyncHandler(academicYearController.update));
router.post('/:id/activate', authenticate, requirePermission(P.ACADEMIC_YEAR_ACTIVATE), asyncHandler(academicYearController.activate));
router.post('/:id/complete', authenticate, requirePermission(P.ACADEMIC_YEAR_COMPLETE), asyncHandler(academicYearController.complete));

export default router;
