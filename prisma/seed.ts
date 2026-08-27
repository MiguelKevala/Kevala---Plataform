import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PERMISSIONS = [
  { key: "users.view", description: "Ver el listado de usuarios." },
  { key: "users.manage", description: "Crear y editar usuarios, asignarles roles." },
  { key: "roles.view", description: "Ver el catálogo de roles." },
  { key: "roles.manage", description: "Crear y editar roles y su relación con permisos." },
  { key: "audit.view", description: "Consultar el registro de auditoría." },
  { key: "vendor.view", description: "Acceso general al módulo Vendor." },
  { key: "vendor.orders.view", description: "Ver el listado y detalle de órdenes Vendor." },
] as const;

const ROLES: Array<{ name: string; description: string; permissions: readonly string[] }> = [
  {
    name: "Super Admin",
    description: "Control total de la plataforma y del RBAC.",
    permissions: PERMISSIONS.map((permission) => permission.key),
  },
  {
    name: "Admin",
    description: "Administra usuarios, consulta auditoría y accede a Vendor en modo lectura.",
    permissions: [
      "users.view",
      "users.manage",
      "roles.view",
      "audit.view",
      "vendor.view",
      "vendor.orders.view",
    ],
  },
  {
    name: "Manager",
    description: "Rol operativo. Acceso de lectura a Vendor.",
    permissions: ["vendor.view", "vendor.orders.view"],
  },
  {
    name: "Operator",
    description: "Rol operativo. Acceso de lectura a Vendor.",
    permissions: ["vendor.view", "vendor.orders.view"],
  },
  {
    name: "Viewer",
    description: "Rol de solo lectura. Acceso de lectura a Vendor.",
    permissions: ["vendor.view", "vendor.orders.view"],
  },
];

async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }

  for (const role of ROLES) {
    const savedRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: { name: role.name, description: role.description },
    });

    const permissionRows = await prisma.permission.findMany({
      where: { key: { in: [...role.permissions] } },
    });

    // Reconcilia role_permissions para que coincida exactamente con el seed (idempotente).
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: savedRole.id,
        permissionId: { notIn: permissionRows.map((permission) => permission.id) },
      },
    });

    for (const permission of permissionRows) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: savedRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: savedRole.id, permissionId: permission.id },
      });
    }
  }

  console.log("RBAC seed completado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
