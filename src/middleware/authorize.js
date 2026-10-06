import { getUserPermissions } from './authenticate.js';

export const requirePermission = (permission) => (req, res, next) => {
  if (!getUserPermissions(req.user).includes(permission)) {
    return res.status(403).json({
      message: 'Forbidden: missing permission',
      requiredPermission: permission,
    });
  }
  next();
};

export const requireAnyPermission = (permissions) => (req, res, next) => {
  const mine = getUserPermissions(req.user);
  if (!permissions.some((p) => mine.includes(p))) {
    return res.status(403).json({ message: 'Forbidden: missing permission' });
  }
  next();
};