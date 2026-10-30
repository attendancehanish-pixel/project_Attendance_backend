import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import {
  listStudentsController,
  getStudentDetailsController,
  getStudentAbsenceSessionsController,
  getStudentFilterOptionsController,
} from '../controllers/staff-students.controller.js';

const router = Router();

router.use(authenticate, requirePermission(P.STUDENTS_VIEW));

/* Filter options (classes) */
router.get('/filter-options', getStudentFilterOptionsController);

/* List + search + pagination */
router.get('/', listStudentsController);

/* Single student */
router.get('/:studentId', getStudentDetailsController);

/* Absence details */
router.get('/:studentId/absences', getStudentAbsenceSessionsController);

export default router;
