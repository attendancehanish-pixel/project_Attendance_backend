// Shared RBAC helpers used by the users / roles / staff APIs.
import prisma from '../lib/prisma.js';
import ROLES from '../permissions/role.constants.js';
import { ApiError } from '../utils/api-error.js';
import {
  ALL_PERMISSIONS,
  BUILT_IN_ROLES,
  hasAdminRole,
  isPersonalRole,
  personalRoleName,
  resolvePermissions,
} from '../permissions/resolve.js';
import { CATALOG_NAMES, expandPermissions } from '../permissions/permission-catalog.js';
import { labelOf } from '../permissions/permission-catalog.js';

export const userInclude = {
  staff: { select: { id: true, employeeCode: true, designation: true, department: true, isActive: true } },
  userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
};

/** Who is performing the action. */
export const actorInfo = (actor) => ({
  isAdmin: hasAdminRole(actor),
  permissions: new Set(resolvePermissions(actor)),
});

/** Make sure every permission name has a row in the Permission table. */
export async function ensurePermissionRows(db, names) {
  const wanted = [...new Set(names)];
  if (!wanted.length) return new Map();
  await db.permission.createMany({
    data: wanted.map((name) => ({ name, description: labelOf(name) })),
    skipDuplicates: true,
  });
  const rows = await db.permission.findMany({ where: { name: { in: wanted } } });
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** Insert any permission that exists in code but not yet in the database. */
export async function syncPermissions() {
  await ensurePermissionRows(prisma, ALL_PERMISSIONS);
}

/** Validate a list of permission names coming from the client; returns the expanded list. */
export function normalisePermissions(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ApiError(400, 'permissions must be an array');
  const unique = [...new Set(input.map((x) => String(x)))];
  const unknown = unique.filter((n) => !CATALOG_NAMES.has(n));
  if (unknown.length) throw new ApiError(400, `Unknown permission(s): ${unknown.join(', ')}`);
  return expandPermissions(unique);
}

/** Non-admins can only hand out permissions they hold themselves. */
export function assertCanGrant(actor, names) {
  const me = actorInfo(actor);
  if (me.isAdmin) return;
  const missing = names.filter((n) => !me.permissions.has(n));
  if (missing.length) {
    throw new ApiError(403, 'You cannot grant permissions you do not have', { permissions: missing });
  }
}

/** Load + validate the chosen roles. Returns the role rows (with permissions). */
export async function loadAssignableRoles(actor, roleIds) {
  if (roleIds === undefined || roleIds === null) return [];
  if (!Array.isArray(roleIds)) throw new ApiError(400, 'roleIds must be an array');
  const ids = [...new Set(roleIds)];
  if (!ids.length) return [];

  const roles = await prisma.role.findMany({
    where: { id: { in: ids } },
    include: { permissions: { include: { permission: true } } },
  });
  if (roles.length !== ids.length) throw new ApiError(400, 'One or more roles were not found');
  if (roles.some(isPersonalRole)) throw new ApiError(400, 'Invalid role');

  const me = actorInfo(actor);
  if (!me.isAdmin) {
    if (roles.some((r) => r.name === ROLES.ADMIN)) {
      throw new ApiError(403, 'Only an administrator can assign the ADMIN role');
    }
    assertCanGrant(actor, roles.flatMap((r) => r.permissions.map((p) => p.permission.name)));
  }
  return roles;
}

/**
 * Replace a user's access: shared roles + personal "custom permissions" role.
 * `db` is a prisma client or transaction client.
 */
export async function applyAccess(db, userId, { roles, permissions }) {
  const personal = personalRoleName(userId);

  // Personal role
  let personalRole = await db.role.findUnique({ where: { name: personal } });
  if (permissions.length) {
    if (!personalRole) {
      personalRole = await db.role.create({
        data: { name: personal, description: 'Custom permissions for one user' },
      });
    }
    const ids = await ensurePermissionRows(db, permissions);
    await db.rolePermission.deleteMany({ where: { roleId: personalRole.id } });
    await db.rolePermission.createMany({
      data: permissions.map((n) => ({ roleId: personalRole.id, permissionId: ids.get(n) })),
    });
  } else if (personalRole) {
    await db.role.delete({ where: { id: personalRole.id } });
    personalRole = null;
  }

  const roleIds = roles.map((r) => r.id);
  if (personalRole) roleIds.push(personalRole.id);

  await db.userRole.deleteMany({ where: { userId } });
  if (roleIds.length) {
    await db.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
  }
}

/** Shape a user row for the API (never includes the password hash). */
export function presentUser(u) {
  const shared = u.userRoles.filter((ur) => !isPersonalRole(ur.role));
  const personal = u.userRoles.find((ur) => isPersonalRole(ur.role));
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    createdAt: u.createdAt,
    roles: shared.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
    customPermissions: personal ? personal.role.permissions.map((p) => p.permission.name).sort() : [],
    permissions: resolvePermissions(u),
    staff: u.staff || null,
  };
}

export const isBuiltInRole = (name) => BUILT_IN_ROLES.includes(name);

export async function countActiveAdmins(exceptUserId) {
  return prisma.user.count({
    where: {
      isActive: true,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      userRoles: { some: { role: { name: ROLES.ADMIN } } },
    },
  });
}
