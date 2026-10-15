import { Router } from 'express';
import * as c from '../controllers/role.controller.js';
import { authenticate as a } from '../middleware/authenticate.js';
import { requirePermission as p, requireAnyPermission as any } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import ah from '../utils/async-handler.js';

const r = Router();

// Whoever can create/edit users or roles needs the role list and the
// permission catalogue to fill their forms.
const canPick = any([P.ROLES_VIEW, P.USERS_CREATE, P.USERS_UPDATE, P.ROLES_CREATE, P.ROLES_UPDATE]);

r.get('/', a, canPick, ah(c.list));
r.post('/', a, p(P.ROLES_CREATE), ah(c.create));
r.patch('/:id', a, p(P.ROLES_UPDATE), ah(c.update));
r.delete('/:id', a, p(P.ROLES_DELETE), ah(c.remove));
export default r;

export const permissionRoutes = Router();
permissionRoutes.get(
  '/',
  a,
  any([P.PERMISSIONS_VIEW, P.ROLES_VIEW, P.USERS_CREATE, P.USERS_UPDATE, P.ROLES_CREATE, P.ROLES_UPDATE]),
  ah(c.catalog)
);
