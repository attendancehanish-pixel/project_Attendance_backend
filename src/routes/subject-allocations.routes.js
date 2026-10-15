import { Router } from 'express';
import subjectAllocationController from '../controllers/subject-allocation.controller.js';
import { authenticate as a } from '../middleware/authenticate.js';
import { requirePermission as p } from '../middleware/authorize.js';
import ah from '../utils/async-handler.js';
import P from '../permissions/permission.constants.js';

const router = Router();

// Main CRUD routes
router.get(
  '/',
  a,
  p(P.SUBJECT_ALLOCATION_VIEW),
  ah(subjectAllocationController.list)
);

// NEW: Get subjects with allocation status (unified view)
router.get(
  '/standard/:standardId/subjects',
  a,
  p(P.SUBJECT_ALLOCATION_VIEW),
  ah(subjectAllocationController.getSubjectsWithStatus)
);

// Get allocations for a specific standard (legacy)
router.get(
  '/standard/:standardId',
  a,
  p(P.SUBJECT_ALLOCATION_VIEW),
  ah(subjectAllocationController.getByStandard)
);

// Get available subjects for a standard (legacy)
router.get(
  '/standard/:standardId/available',
  a,
  p(P.SUBJECT_ALLOCATION_VIEW),
  ah(subjectAllocationController.getAvailableSubjects)
);

// NEW: Toggle single subject
router.patch(
  '/standard/:standardId/subject/:subjectId/toggle',
  a,
  p(P.SUBJECT_ALLOCATION_UPDATE),
  ah(subjectAllocationController.toggleAllocation)
);

// NEW: Bulk update
router.patch(
  '/standard/:standardId/bulk',
  a,
  p(P.SUBJECT_ALLOCATION_UPDATE),
  ah(subjectAllocationController.bulkUpdate)
);

router.get(
  '/:id',
  a,
  p(P.SUBJECT_ALLOCATION_VIEW),
  ah(subjectAllocationController.get)
);

router.post(
  '/',
  a,
  p(P.SUBJECT_ALLOCATION_CREATE),
  ah(subjectAllocationController.create)
);

router.post(
  '/bulk',
  a,
  p(P.SUBJECT_ALLOCATION_CREATE),
  ah(subjectAllocationController.bulkCreate)
);

router.delete(
  '/:id',
  a,
  p(P.SUBJECT_ALLOCATION_DELETE),
  ah(subjectAllocationController.remove)
);

router.delete(
  '/standard/:standardId/bulk',
  a,
  p(P.SUBJECT_ALLOCATION_DELETE),
  ah(subjectAllocationController.bulkRemove)
);

export default router;