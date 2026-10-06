import prisma from '../lib/prisma.js';
import { signAccessToken } from '../lib/jwt.js';
import {
  comparePassword,
  randomToken,
  hashToken,
} from '../utils/hash.js';
import { refreshDays } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';

const include = {
  userRoles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
};

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  isActive: u.isActive,
  roles: u.userRoles.map((x) => x.role.name),
  permissions: [
    ...new Set(
      u.userRoles.flatMap((x) =>
        x.role.permissions.map((p) => p.permission.name)
      )
    ),
  ].sort(),
});

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

export { publicUser };

// ✅ Add default export for convenience
export default {
  login,
  publicUser,
};