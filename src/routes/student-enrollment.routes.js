import { Router } from 'express';
import studentEnrollmentController from '../controllers/student-enrollment.controller.js';
import { authenticate as a } from '../middleware/authenticate.js';
import { requirePermission as p } from '../middleware/authorize.js';
import ah from '../utils/async-handler.js';
import P from '../permissions/permission.constants.js';

const router = Router();

// Setup for the bulk-enrollment page: selected academic year + standard.
router.get(
  '/academic-year/:academicYearId/setup',
  a,
  p(P.STUDENTS_VIEW),
  ah(studentEnrollmentController.setup)
);

// List enrollments. academicYearId is required; standardId/status/search are optional.
router.get(
  '/',
  a,
  p(P.STUDENTS_VIEW),
  ah(studentEnrollmentController.list)
);

// Type-ahead student lookup + roll number suggestion (must precede '/:id').
router.get('/lookup', a, p(P.STUDENTS_ENROLL), ah(studentEnrollmentController.lookup));
router.get('/next-roll-no', a, p(P.STUDENTS_ENROLL), ah(studentEnrollmentController.nextRollNo));

// Bulk enrollment used by the admin enrollment page.
router.post(
  '/bulk',
  a,
  p(P.STUDENTS_ENROLL),
  ah(studentEnrollmentController.bulkEnroll)
);

router.get(
  '/:id',
  a,
  p(P.STUDENTS_VIEW),
  ah(studentEnrollmentController.get)
);

router.patch(
  '/:id',
  a,
  p(P.STUDENTS_UPDATE),
  ah(studentEnrollmentController.update)
);

router.delete(
  '/:id',
  a,
  p(P.STUDENTS_ENROLL),
  ah(studentEnrollmentController.remove)
);

export default router;
