import P from './permission.constants.js';
import ROLES from './role.constants.js';
import ROLE_PERMISSIONS from './permission-map.js';

export const ALL_PERMISSIONS = Object.values(P);
export const PERSONAL_ROLE_PREFIX = 'user:';
export const BUILT_IN_ROLES = Object.keys(ROLES);

/** A role only used to hold one user's directly granted ("custom") permissions. */
export const isPersonalRole = (role) => role.name.startsWith(PERSONAL_ROLE_PREFIX);
export const personalRoleName = (userId) => `${PERSONAL_ROLE_PREFIX}${userId}`;

export const hasAdminRole = (user) =>
  user.userRoles.some((ur) => ur.role.name === ROLES.ADMIN);

/** Effective permission names for a user loaded with userRoles→role→permissions→permission. */
export function resolvePermissions(user) {
  // ADMIN is a superuser: always every permission the code knows about, even
  // if the seed has not been re-run since a new permission was added.
  if (hasAdminRole(user)) return [...ALL_PERMISSIONS].sort();
  return [
    ...new Set(
      user.userRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name))
    ),
  ].sort();
}

// Everything a plain teacher (STAFF role) can do. A user whose permissions all
// fall inside this set gets the teacher portal; anyone with something more
// gets the management portal (with only the menus they were granted).
const TEACHER_SET = new Set(ROLE_PERMISSIONS.STAFF);

export const portalFor = (user, permissions) =>
  hasAdminRole(user) || permissions.some((p) => !TEACHER_SET.has(p)) ? 'admin' : 'staff';
