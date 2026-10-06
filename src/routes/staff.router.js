// routes/staff.router.js
import { Router } from 'express';
import { authenticate as a } from '../middleware/authenticate.js';
import { requirePermission as p } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import ah from '../utils/async-handler.js';
import { staffController } from '../controllers/staff.controller.js';

const staffRouter = Router();

staffRouter.get('/', a, p(P.STAFF_VIEW), ah(staffController.list));
staffRouter.get('/:id', a, p(P.STAFF_VIEW), ah(staffController.get));
staffRouter.get('/user/:userId', a, p(P.STAFF_VIEW), ah(staffController.getByUserId));
staffRouter.post('/', a, p(P.STAFF_CREATE), ah(staffController.create));
staffRouter.patch('/:id', a, p(P.STAFF_UPDATE), ah(staffController.update));
staffRouter.delete('/:id', a, p(P.STAFF_DEACTIVATE), ah(staffController.remove));

export default staffRouter;