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
  { key: "vendor.orders.confirm", description: "Confirmar órdenes Vendor pendientes." },
  { key: "vendor.orders.reject", description: "Rechazar órdenes Vendor pendientes." },
  { key: "vendor.orders.deliver", description: "Marcar órdenes Vendor confirmadas como entregadas." },
  { key: "vendor.orders.create", description: "Crear nuevas órdenes Vendor." },
  { key: "vendor.orders.edit", description: "Editar la información operativa de órdenes Vendor." },
  { key: "vendor.carriers.manage", description: "Administrar el catálogo de carriers (crear, editar, activar/desactivar)." },
  { key: "vendor.modes.manage", description: "Administrar el catálogo de modes (crear, editar, activar/desactivar)." },
  { key: "products.view", description: "Ver el catálogo maestro de productos (Products / Catalog)." },
  { key: "products.manage", description: "Crear, editar y eliminar productos del catálogo maestro." },
] as const;

const ROLES: Array<{ name: string; description: string; permissions: readonly string[] }> = [
  {
    name: "Super Admin",
    description: "Control total de la plataforma y del RBAC.",
    permissions: PERMISSIONS.map((permission) => permission.key),
  },
  {
    name: "Admin",
    description: "Administra usuarios, consulta auditoría y opera el módulo Vendor.",
    permissions: [
      "users.view",
      "users.manage",
      "roles.view",
      "audit.view",
      "vendor.view",
      "vendor.orders.view",
      "vendor.orders.confirm",
      "vendor.orders.reject",
      "vendor.orders.deliver",
      "vendor.orders.create",
      "vendor.orders.edit",
      "vendor.carriers.manage",
      "vendor.modes.manage",
      "products.view",
      "products.manage",
    ],
  },
  {
    name: "Manager",
    description: "Rol operativo. Opera el módulo Vendor.",
    permissions: [
      "vendor.view",
      "vendor.orders.view",
      "vendor.orders.confirm",
      "vendor.orders.reject",
      "vendor.orders.deliver",
      "vendor.orders.create",
      "vendor.orders.edit",
      "products.view",
    ],
  },
  {
    name: "Operator",
    description: "Rol operativo. Opera el módulo Vendor.",
    permissions: [
      "vendor.view",
      "vendor.orders.view",
      "vendor.orders.confirm",
      "vendor.orders.reject",
      "vendor.orders.deliver",
      "vendor.orders.create",
      "vendor.orders.edit",
      "products.view",
    ],
  },
  {
    name: "Viewer",
    description: "Rol de solo lectura. Acceso de lectura a Vendor.",
    permissions: ["vendor.view", "vendor.orders.view", "products.view"],
  },
];

// Fase 8: seed obligatorio de Modes. Solo crea si no existe — no fuerza
// isActive en cada corrida, para no reactivar un Mode que un admin desactivó
// deliberadamente después del seed inicial.
const MODES = ["LTL", "SP"] as const;

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

  for (const name of MODES) {
    await prisma.mode.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    });
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
