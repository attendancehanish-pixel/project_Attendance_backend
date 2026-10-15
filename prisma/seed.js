import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import P from "../src/permissions/permission.constants.js";
import ROLE_PERMISSIONS from "../src/permissions/permission-map.js";
import { labelOf } from "../src/permissions/permission-catalog.js";

const db = new PrismaClient();

// Helper functions
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function main() {
  // ==================== PERMISSIONS & ROLES ====================
  const permissionMap = {};

  for (const name of Object.values(P)) {
    const row = await db.permission.upsert({
      where: { name },
      update: {},
      create: { name, description: labelOf(name) },
    });
    permissionMap[name] = row.id;
  }

  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} role` },
    });

    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: permissions.map((name) => ({
        roleId: role.id,
        permissionId: permissionMap[name],
      })),
    });
  }

  // ==================== ADMIN USER ====================
  const passwordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!",
    12,
  );

  const admin = await db.user.upsert({
    where: { email: process.env.SEED_ADMIN_EMAIL || "admin@example.com" },
    update: { isActive: true },
    create: {
      name: "System Administrator",
      email: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
      passwordHash,
    },
  });

  // Get or create ADMIN role
  let adminRole = await db.role.findUnique({
    where: { name: "ADMIN" }
  });

  if (!adminRole) {
    adminRole = await db.role.create({
      data: { name: "ADMIN", description: "Administrator role" }
    });
  }

  await db.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });


  console.log(`✅ Seed complete!`);

}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });