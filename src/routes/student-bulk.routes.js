import { Router } from 'express';
import studentController from '../controllers/student.controller.js';
import { authenticate as a } from '../middleware/authenticate.js';
import { requirePermission as p } from '../middleware/authorize.js';
import ah from '../utils/async-handler.js';
import P from '../permissions/permission.constants.js';

const router = Router();

// Bulk student creation. Mounted before the generic /students CRUD router.
router.post('/bulk', a, p(P.STUDENTS_CREATE), ah(studentController.bulkCreate));

export default router;
