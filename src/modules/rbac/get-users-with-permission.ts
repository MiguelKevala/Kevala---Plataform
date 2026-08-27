import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PermissionKey } from "./permissions";

/**
 * Forma mínima de cliente Prisma que esta función necesita. Permite pasar el
 * `tx` de un `prisma.$transaction(...)` cuando el cálculo de destinatarios
 * debe participar en la misma transacción que la escritura que dispara (p.
 * ej. notificaciones de Vendor), o el `prisma` por defecto en el resto de
 * los casos.
 */
export interface UserRoleReader {
  userRole: {
    findMany: (args: Prisma.UserRoleFindManyArgs) => Promise<Array<{ userId: string }>>;
  };
}

/**
 * Ids de usuarios ACTIVOS que tienen el permiso dado a través de al menos uno
 * de sus roles. Complementa a `getUserPermissions` (que resuelve permisos de
 * un usuario) resolviendo el sentido inverso: usuarios que tienen un permiso.
 */
export async function getActiveUserIdsWithPermission(
  permission: PermissionKey,
  db: UserRoleReader = prisma,
): Promise<string[]> {
  const userRoles = await db.userRole.findMany({
    where: {
      user: { isActive: true },
      role: { rolePermissions: { some: { permission: { key: permission } } } },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  return userRoles.map((userRole) => userRole.userId);
}
