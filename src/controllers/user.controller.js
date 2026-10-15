import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { hashPassword } from '../utils/hash.js';
import ROLES from '../permissions/role.constants.js';
import { hasAdminRole } from '../permissions/resolve.js';
import {
  actorInfo,
  applyAccess,
  assertCanGrant,
  countActiveAdmins,
  loadAssignableRoles,
  normalisePermissions,
  presentUser,
  userInclude,
} from '../services/access.service.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanEmail = (v) => String(v || '').trim().toLowerCase();
const cleanName = (v) => String(v || '').trim();

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }
}

async function loadTarget(id) {
  const u = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!u) throw new ApiError(404, 'User not found');
  return u;
}

// Only administrators may touch an administrator account.
function assertCanManage(actor, target) {
  if (hasAdminRole(target) && !actorInfo(actor).isAdmin) {
    throw new ApiError(403, 'Only an administrator can modify an administrator account');
  }
}

export const list = async (req, res) => {
  const users = await prisma.user.findMany({ include: userInclude, orderBy: { name: 'asc' } });
  res.json({ data: users.map(presentUser) });
};

export const get = async (req, res) => {
  res.json({ data: presentUser(await loadTarget(req.params.id)) });
};

export const create = async (req, res) => {
  const name = cleanName(req.body.name);
  const email = cleanEmail(req.body.email);
  const { password } = req.body;

  if (!name) throw new ApiError(400, 'Name is required');
  if (!EMAIL.test(email)) throw new ApiError(400, 'A valid email is required');
  checkPassword(password);

  if (await prisma.user.findUnique({ where: { email } })) {
    throw new ApiError(409, 'A user with this email already exists');
  }

  const roles = await loadAssignableRoles(req.user, req.body.roleIds);
  const permissions = normalisePermissions(req.body.permissions);
  assertCanGrant(req.user, permissions);

  const passwordHash = await hashPassword(password);
  const id = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash, isActive: true } });
    await applyAccess(tx, user.id, { roles, permissions });
    return user.id;
  });

  res.status(201).json({ data: presentUser(await loadTarget(id)) });
};

export const update = async (req, res) => {
  const { id } = req.params;
  const target = await loadTarget(id);
  assertCanManage(req.user, target);

  const data = {};
  if (req.body.name !== undefined) {
    data.name = cleanName(req.body.name);
    if (!data.name) throw new ApiError(400, 'Name is required');
  }
  if (req.body.email !== undefined) {
    data.email = cleanEmail(req.body.email);
    if (!EMAIL.test(data.email)) throw new ApiError(400, 'A valid email is required');
    if (data.email !== target.email) {
      if (await prisma.user.findUnique({ where: { email: data.email } })) {
        throw new ApiError(409, 'A user with this email already exists');
      }
    }
  }
  if (req.body.password) {
    checkPassword(req.body.password);
    data.passwordHash = await hashPassword(req.body.password);
  }

  const changesAccess = req.body.roleIds !== undefined || req.body.permissions !== undefined;
  let access = null;
  if (changesAccess) {
    if (id === req.user.id) {
      throw new ApiError(403, 'You cannot change your own roles or permissions');
    }
    // Missing field = keep what the user already has.
    const keepRoleIds = target.userRoles
      .filter((ur) => !ur.role.name.startsWith('user:'))
      .map((ur) => ur.role.id);
    const keepPerms = target.userRoles
      .filter((ur) => ur.role.name.startsWith('user:'))
      .flatMap((ur) => ur.role.permissions.map((p) => p.permission.name));

    const roles = await loadAssignableRoles(
      req.user,
      req.body.roleIds !== undefined ? req.body.roleIds : keepRoleIds
    );
    const permissions = normalisePermissions(
      req.body.permissions !== undefined ? req.body.permissions : keepPerms
    );
    assertCanGrant(req.user, permissions);

    // Never leave the system without an administrator.
    const losesAdmin = hasAdminRole(target) && !roles.some((r) => r.name === ROLES.ADMIN);
    if (losesAdmin && (await countActiveAdmins(id)) === 0) {
      throw new ApiError(400, 'At least one active administrator is required');
    }
    access = { roles, permissions };
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.user.update({ where: { id }, data });
    if (access) await applyAccess(tx, id, access);
    if (data.passwordHash) {
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
  });

  res.json({ data: presentUser(await loadTarget(id)) });
};

export const setStatus = async (req, res) => {
  const { id } = req.params;
  if (typeof req.body.isActive !== 'boolean') throw new ApiError(400, 'isActive (true/false) is required');
  const isActive = req.body.isActive;

  const target = await loadTarget(id);
  assertCanManage(req.user, target);

  if (!isActive) {
    if (id === req.user.id) throw new ApiError(400, 'You cannot deactivate your own account');
    if (hasAdminRole(target) && (await countActiveAdmins(id)) === 0) {
      throw new ApiError(400, 'At least one active administrator is required');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { isActive } });
    // Keep the linked staff profile in step with the login account.
    if (target.staff) await tx.staff.update({ where: { id: target.staff.id }, data: { isActive } });
    if (!isActive) {
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
  });

  res.json({ data: presentUser(await loadTarget(id)) });
};
