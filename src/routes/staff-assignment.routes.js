import { Router } from 'express';
import staffAssignmentController from '../controllers/staff-assignment.controller.js';
import { authenticate as a } from '../middleware/authenticate.js';
import { requirePermission as p } from '../middleware/authorize.js';
import ah from '../utils/async-handler.js';
import P from '../permissions/permission.constants.js';

const router = Router();

// Main CRUD
router.get(
  '/',
  a,
  p(P.STAFF_ASSIGNMENT_VIEW),
  ah(staffAssignmentController.list)
);

router.get(
  '/available-staff',
  a,
  p(P.STAFF_ASSIGNMENT_VIEW),
  ah(staffAssignmentController.getAvailableStaff)
);

router.post(
  '/bulk',
  a,
  p(P.STAFF_ASSIGNMENT_CREATE),
  ah(staffAssignmentController.bulkCreate)
);

router.post(
  '/',
  a,
  p(P.STAFF_ASSIGNMENT_CREATE),
  ah(staffAssignmentController.create)
);

router.get(
  '/:id',
  a,
  p(P.STAFF_ASSIGNMENT_VIEW),
  ah(staffAssignmentController.get)
);

router.patch(
  '/:id',
  a,
  p(P.STAFF_ASSIGNMENT_UPDATE),
  ah(staffAssignmentController.update)
);

router.delete(
  '/:id',
  a,
  p(P.STAFF_ASSIGNMENT_DELETE),
  ah(staffAssignmentController.remove)
);

// Staff-specific
router.get(
  '/staff/:staffId/assignments',
  a,
  p(P.STAFF_ASSIGNMENT_VIEW),
  ah(staffAssignmentController.getStaffAssignments)
);

// Subject-specific
router.get(
  '/standard/:standardId/subject/:subjectId/assignments',
  a,
  p(P.STAFF_ASSIGNMENT_VIEW),
  ah(staffAssignmentController.getSubjectAssignments)
);

export default router;