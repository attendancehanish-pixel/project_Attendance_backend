import prisma from '../lib/prisma.js';
import { signAccessToken } from '../lib/jwt.js';
import {
  comparePassword,
  hashPassword,
  randomToken,
  hashToken,
} from '../utils/hash.js';
import { refreshDays } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';
import { resolvePermissions, portalFor, isPersonalRole } from '../permissions/resolve.js';

const include = {
  userRoles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
};

const publicUser = (u) => {
  const permissions = resolvePermissions(u);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    roles: u.userRoles.filter((x) => !isPersonalRole(x.role)).map((x) => x.role.name),
    permissions,
    // 'admin' = management portal (sidebar filtered by permissions),
    // 'staff' = teacher portal.
    portal: portalFor(u, permissions),
  };
};

export const login = async (email, password) => {
  const user = await prisma.user.findUnique({ where: { email }, include });

  if (
    !user ||
    !user.isActive ||
    !(await comparePassword(password, user.passwordHash))
  ) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const raw = randomToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(raw),
      userId: user.id,
      expiresAt: new Date(Date.now() + refreshDays * 86400000),
    },
  });

  return {
    accessToken: signAccessToken(user.id),
    refreshToken: raw,
    user: publicUser(user),
  };
};

export const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new ApiError(401, 'Invalid account');
  }

  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) {
    throw new ApiError(400, 'Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    // Optional: revoke other refresh tokens (log out other devices)
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
};

export { publicUser };

// ✅ Add default export for convenience
export default {
  changePassword,
  login,
  publicUser,
};