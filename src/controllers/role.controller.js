import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { permissionCatalog } from '../permissions/permission-catalog.js';
import { isPersonalRole } from '../permissions/resolve.js';
import {
  assertCanGrant,
  ensurePermissionRows,
  isBuiltInRole,
  normalisePermissions,
} from '../services/access.service.js';

const include = { permissions: { include: { permission: true } }, _count: { select: { userRoles: true } } };

const present = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  builtIn: isBuiltInRole(r.name),
  userCount: r._count.userRoles,
  permissions: r.permissions.map((p) => p.permission.name).sort(),
});

export const catalog = async (req, res) => res.json({ data: permissionCatalog() });

export const list = async (req, res) => {
  const roles = await prisma.role.findMany({ include, orderBy: { name: 'asc' } });
  res.json({ data: roles.filter((r) => !isPersonalRole(r)).map(present) });
};

const cleanName = (v) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

async function writePermissions(tx, roleId, names) {
  const ids = await ensurePermissionRows(tx, names);
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (names.length) {
    await tx.rolePermission.createMany({
      data: names.map((n) => ({ roleId, permissionId: ids.get(n) })),
    });
  }
}

export const create = async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) throw new ApiError(400, 'Role name is required');
  if (await prisma.role.findUnique({ where: { name } })) {
    throw new ApiError(409, 'A role with this name already exists');
  }
  const permissions = normalisePermissions(req.body.permissions);
  assertCanGrant(req.user, permissions);

  const id = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: { name, description: String(req.body.description || '').trim() || null },
    });
    await writePermissions(tx, role.id, permissions);
    return role.id;
  });
  res.status(201).json({ data: present(await prisma.role.findUnique({ where: { id }, include })) });
};

async function loadEditable(id) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role || isPersonalRole(role)) throw new ApiError(404, 'Role not found');
  if (isBuiltInRole(role.name)) {
    throw new ApiError(400, `${role.name} is a built-in role and cannot be changed. Create a new role instead.`);
  }
  return role;
}

export const update = async (req, res) => {
  const role = await loadEditable(req.params.id);
  const data = {};
  if (req.body.name !== undefined) {
    data.name = cleanName(req.body.name);
    if (!data.name) throw new ApiError(400, 'Role name is required');
    if (data.name !== role.name && (await prisma.role.findUnique({ where: { name: data.name } }))) {
      throw new ApiError(409, 'A role with this name already exists');
    }
  }
  if (req.body.description !== undefined) data.description = String(req.body.description || '').trim() || null;

  let permissions = null;
  if (req.body.permissions !== undefined) {
    permissions = normalisePermissions(req.body.permissions);
    assertCanGrant(req.user, permissions);
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.role.update({ where: { id: role.id }, data });
    if (permissions) await writePermissions(tx, role.id, permissions);
  });
  res.json({ data: present(await prisma.role.findUnique({ where: { id: role.id }, include })) });
};

export const remove = async (req, res) => {
  const role = await loadEditable(req.params.id);
  const inUse = await prisma.userRole.count({ where: { roleId: role.id } });
  if (inUse) throw new ApiError(409, `This role is assigned to ${inUse} user(s). Remove it from them first.`);
  await prisma.role.delete({ where: { id: role.id } });
  res.json({ data: { id: role.id } });
};
