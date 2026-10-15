import { Router } from 'express';
import { factory } from '../controllers/generic.controller.js';
import { authenticate as a } from '../middleware/authenticate.js';
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js';
import ah from '../utils/async-handler.js';

// `permissions.view` may be a single permission or a list (any-of).
const guard = (perm) => (Array.isArray(perm) ? requireAnyPermission(perm) : requirePermission(perm));

export default (model, permissions) => {
  const r = Router();
  const c = factory(model, { fields: permissions.fields });

  r.get('/', a, guard(permissions.view), ah(c.list));
  r.get('/:id', a, guard(permissions.view), ah(c.get));
  r.post('/', a, guard(permissions.create), ah(c.create));

  if (permissions.update) r.patch('/:id', a, guard(permissions.update), ah(c.update));
  if (permissions.remove) r.delete('/:id', a, guard(permissions.remove), ah(c.remove));

  return r;
};
