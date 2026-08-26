import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { ROLES } from "@/modules/rbac/roles";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { ForbiddenError, requirePermission } from "@/modules/rbac/require-permission";

const TEST_EMAIL_PREFIX = "rbac-test";

async function createTestUser(suffix: string, roleName?: string) {
  const user = await prisma.user.create({
    data: {
      email: `${TEST_EMAIL_PREFIX}-${suffix}@kevala.test`,
      passwordHash: "not-a-real-hash",
      name: `RBAC Test ${suffix}`,
    },
  });

  if (roleName) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  return user;
}

describe("RBAC", () => {
  let superAdminUser: Awaited<ReturnType<typeof createTestUser>>;
  let adminUser: Awaited<ReturnType<typeof createTestUser>>;
  let managerUser: Awaited<ReturnType<typeof createTestUser>>;
  let noRoleUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    superAdminUser = await createTestUser("super-admin", ROLES.SUPER_ADMIN);
    adminUser = await createTestUser("admin", ROLES.ADMIN);
    managerUser = await createTestUser("manager", ROLES.MANAGER);
    noRoleUser = await createTestUser("no-role");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    });
  });

  describe("catálogo de permisos", () => {
    it("tiene exactamente los 5 permisos aprobados, sin permissions.manage", async () => {
      const permissions = await prisma.permission.findMany({ select: { key: true } });
      const keys = permissions.map((permission) => permission.key).sort();

      expect(keys).toEqual(
        [
          PERMISSIONS.AUDIT_VIEW,
          PERMISSIONS.ROLES_MANAGE,
          PERMISSIONS.ROLES_VIEW,
          PERMISSIONS.USERS_MANAGE,
          PERMISSIONS.USERS_VIEW,
        ].sort(),
      );
      expect(keys).not.toContain("permissions.manage");
    });
  });

  describe("getUserPermissions", () => {
    it("Super Admin tiene los 5 permisos", async () => {
      const permissions = await getUserPermissions(superAdminUser.id);
      expect(permissions.size).toBe(5);
      for (const key of Object.values(PERMISSIONS)) {
        expect(permissions.has(key)).toBe(true);
      }
    });

    it("Admin tiene exactamente users.view, users.manage, roles.view, audit.view", async () => {
      const permissions = await getUserPermissions(adminUser.id);
      expect([...permissions].sort()).toEqual(
        [
          PERMISSIONS.USERS_VIEW,
          PERMISSIONS.USERS_MANAGE,
          PERMISSIONS.ROLES_VIEW,
          PERMISSIONS.AUDIT_VIEW,
        ].sort(),
      );
      expect(permissions.has(PERMISSIONS.ROLES_MANAGE)).toBe(false);
    });

    it("Manager no tiene permisos funcionales todavía", async () => {
      const permissions = await getUserPermissions(managerUser.id);
      expect(permissions.size).toBe(0);
    });

    it("un usuario sin roles no tiene permisos", async () => {
      const permissions = await getUserPermissions(noRoleUser.id);
      expect(permissions.size).toBe(0);
    });
  });

  describe("requirePermission", () => {
    it("resuelve sin lanzar error cuando el usuario tiene el permiso", async () => {
      await expect(
        requirePermission(adminUser.id, PERMISSIONS.USERS_MANAGE),
      ).resolves.toBeUndefined();
    });

    it("lanza ForbiddenError cuando el usuario NO tiene el permiso", async () => {
      await expect(
        requirePermission(adminUser.id, PERMISSIONS.ROLES_MANAGE),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lanza ForbiddenError para un usuario sin roles", async () => {
      await expect(
        requirePermission(noRoleUser.id, PERMISSIONS.USERS_VIEW),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
