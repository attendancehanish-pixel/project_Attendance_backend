// import { Router } from 'express';
// import { factory } from '../controllers/generic.controller.js';
// import { authenticate as a }  from '../middleware/authenticate.js';
// import { requirePermission as p } from '../middleware/authorize.js';
// import ah from '../utils/async-handler.js';

// export default (model, permissions) => {
//   const r = Router();
//   const c = factory(model);

//   r.get('/', a,   ah(c.list));
//   r.get('/:id', a,   ah(c.get));
//   r.post('/', a, p(permissions.create), ah(c.create));
  
//   if (permissions.update) {
//     r.patch('/:id', a, p(permissions.update), ah(c.update));
//   }
  
//   if (permissions.remove) {
//     r.delete('/:id', a, p(permissions.remove), ah(c.remove));
//   }

//   return r;
// };

import { Router } from 'express';
import { factory } from '../controllers/generic.controller.js';
import { authenticate as a }  from '../middleware/authenticate.js';
import { requirePermission as p } from '../middleware/authorize.js';
import ah from '../utils/async-handler.js';

export default (model, permissions) => {
  const r = Router();
  const c = factory(model);

  r.get('/', a,   ah(c.list));
  r.get('/:id', a,   ah(c.get));
  r.post('/', a,  ah(c.create));
  
  if (permissions.update) {
    r.patch('/:id', a, ah(c.update));
  }
  
  if (permissions.remove) {
    r.delete('/:id', a, ah(c.remove));
  }

  return r;
};