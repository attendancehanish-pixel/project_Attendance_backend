import { Router } from 'express';
import * as c from '../controllers/user.controller.js';
import { authenticate as a } from '../middleware/authenticate.js';
import { requirePermission as p } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import ah from '../utils/async-handler.js';

const r = Router();
r.get('/', a, p(P.USERS_VIEW), ah(c.list));
r.post('/', a, p(P.USERS_CREATE), ah(c.create));
r.get('/:id', a, p(P.USERS_VIEW), ah(c.get));
r.patch('/:id', a, p(P.USERS_UPDATE), ah(c.update));
r.patch('/:id/status', a, p(P.USERS_DEACTIVATE), ah(c.setStatus));
export default r;
