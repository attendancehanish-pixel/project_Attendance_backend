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
  p(P.SUBJECTS_VIEW || 'subjects.view'),
  ah(subjectAllocationController.list)
);

// NEW: Get subjects with allocation status (unified view)
router.get(
  '/standard/:standardId/subjects',
  a,
  p(P.SUBJECTS_VIEW || 'subjects.view'),
  ah(subjectAllocationController.getSubjectsWithStatus)
);

// Get allocations for a specific standard (legacy)
router.get(
  '/standard/:standardId',
  a,
  p(P.SUBJECTS_VIEW || 'subjects.view'),
  ah(subjectAllocationController.getByStandard)
);

// Get available subjects for a standard (legacy)
router.get(
  '/standard/:standardId/available',
  a,
  p(P.SUBJECTS_VIEW || 'subjects.view'),
  ah(subjectAllocationController.getAvailableSubjects)
);

// NEW: Toggle single subject
router.patch(
  '/standard/:standardId/subject/:subjectId/toggle',
  a,
  p(P.SUBJECTS_UPDATE || 'subjects.update'),
  ah(subjectAllocationController.toggleAllocation)
);

// NEW: Bulk update
router.patch(
  '/standard/:standardId/bulk',
  a,
  p(P.SUBJECTS_UPDATE || 'subjects.update'),
  ah(subjectAllocationController.bulkUpdate)
);

router.get(
  '/:id',
  a,
  p(P.SUBJECTS_VIEW || 'subjects.view'),
  ah(subjectAllocationController.get)
);

router.post(
  '/',
  a,
  p(P.SUBJECTS_CREATE || 'subjects.create'),
  ah(subjectAllocationController.create)
);

router.post(
  '/bulk',
  a,
  p(P.SUBJECTS_CREATE || 'subjects.create'),
  ah(subjectAllocationController.bulkCreate)
);

router.delete(
  '/:id',
  a,
  p(P.SUBJECTS_DELETE || 'subjects.delete'),
  ah(subjectAllocationController.remove)
);

router.delete(
  '/standard/:standardId/bulk',
  a,
  p(P.SUBJECTS_DELETE || 'subjects.delete'),
  ah(subjectAllocationController.bulkRemove)
);

export default router;