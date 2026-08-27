import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/modules/rbac/roles";
import {
  confirmVendorOrder,
  deliverVendorOrder,
  rejectVendorOrder,
} from "@/modules/vendor/services/vendor-order-actions.service";
import * as createNotificationModule from "@/modules/notifications/service/create-notification";
import { createCarrier } from "@/modules/carriers/service/carrier-crud.service";
import { createMode } from "@/modules/modes/service/mode-crud.service";

vi.mock("@/modules/notifications/service/create-notification", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/notifications/service/create-notification")>();
  return { ...actual, createNotifications: vi.fn(actual.createNotifications) };
});

const EMAIL_PREFIX = "vendor-notif-test";
const ORDER_PREFIX = "VNOTIF-";
const CARRIER_NAME = "TEST-VNOTIF-CARRIER";
const MODE_NAME = "TEST-VNOTIF-MODE";

const createdOrderIds: string[] = [];
let carrierId: string;
let modeId: string;

async function createUser(suffix: string, opts: { roleName?: string; isActive?: boolean } = {}) {
  const user = await prisma.user.create({
    data: {
      email: `${EMAIL_PREFIX}-${suffix}@kevala.test`,
      passwordHash: "not-a-real-hash",
      name: `Vendor Notif Test ${suffix}`,
      isActive: opts.isActive ?? true,
    },
  });

  if (opts.roleName) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: opts.roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  return user;
}

async function createOrder(suffix: string, status: "PENDING" | "CONFIRMED" = "PENDING") {
  const order = await prisma.vendorOrder.create({
    data: {
      orderNumber: `${ORDER_PREFIX}${suffix}`,
      status,
      orderDate: new Date("2026-01-01"),
      // Fase 8.1: DELIVERED exige checklist completo y consistente, así que
      // las órdenes CONFIRMED de este archivo ya nacen listas para entregar.
      ...(status === "CONFIRMED"
        ? {
            confirmedAt: new Date("2026-01-02"),
            carrierId,
            modeId,
            tracking: "1Z999AA10123456784",
            confirmationDeadline: new Date("2026-01-03"),
            deliveryDeadline: new Date("2026-01-05"),
            deliveryDate: new Date("2026-01-04"),
            pickUpDate: new Date("2026-01-02"),
            shipmentDate: new Date("2026-01-01"),
            invoiceNumber: 9001,
            packingSlip: true,
            cartonLabels: true,
            bol: true,
            palletLabels: true,
            asn: true,
            carrierLabels: false,
          }
        : {}),
    },
  });
  createdOrderIds.push(order.id);
  return order;
}

async function cleanup() {
  if (createdOrderIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "VendorOrder", entityId: { in: createdOrderIds } },
    });
  }
  await prisma.vendorOrder.deleteMany({ where: { orderNumber: { startsWith: ORDER_PREFIX } } });
  // Cascada: borrar los usuarios de prueba elimina también sus notifications/userRoles.
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });

  const carrier = await prisma.carrier.findUnique({ where: { name: CARRIER_NAME } });
  if (carrier) {
    await prisma.auditLog.deleteMany({ where: { entityType: "Carrier", entityId: carrier.id } });
    await prisma.carrier.delete({ where: { id: carrier.id } });
  }
  const mode = await prisma.mode.findUnique({ where: { name: MODE_NAME } });
  if (mode) {
    await prisma.auditLog.deleteMany({ where: { entityType: "Mode", entityId: mode.id } });
    await prisma.mode.delete({ where: { id: mode.id } });
  }

  createdOrderIds.length = 0;
}

describe("Notificaciones de acciones Vendor (Fase 7)", () => {
  let actor: { id: string };
  let recipientWithView: { id: string };
  let recipientInactive: { id: string };
  let userWithoutPermission: { id: string };

  beforeAll(async () => {
    await cleanup();
    actor = await createUser("actor", { roleName: ROLES.MANAGER });
    recipientWithView = await createUser("recipient-view", { roleName: ROLES.VIEWER });
    recipientInactive = await createUser("recipient-inactive", {
      roleName: ROLES.VIEWER,
      isActive: false,
    });
    userWithoutPermission = await createUser("no-permission");

    const carrierCtx = { userId: actor.id, ipAddress: null, userAgent: null };
    const carrier = await createCarrier(CARRIER_NAME, carrierCtx);
    if (carrier.ok) carrierId = carrier.carrier.id;
    const mode = await createMode(MODE_NAME, carrierCtx);
    if (mode.ok) modeId = mode.mode.id;
  });

  afterAll(cleanup);

  it("al confirmar: notifica a usuarios activos con vendor.orders.view, no al actor, no a inactivos ni sin permiso", async () => {
    const order = await createOrder("confirm-1", "PENDING");

    const result = await confirmVendorOrder(order.id, {
      userId: actor.id,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });
    expect(result.ok).toBe(true);

    // OJO: la base puede tener otros usuarios activos con vendor.orders.view
    // ajenos a este test (p. ej. datos de demo de fases previas), así que no
    // se asume que la lista de destinatarios tenga longitud exacta: solo se
    // verifica presencia/ausencia de los usuarios relevantes para este caso.
    const notifications = await prisma.notification.findMany({
      where: { entityType: "VendorOrder", entityId: order.id },
    });
    const recipientIds = notifications.map((n) => n.userId);

    expect(recipientIds).toContain(recipientWithView.id);
    expect(recipientIds).not.toContain(actor.id);
    expect(recipientIds).not.toContain(recipientInactive.id);
    expect(recipientIds).not.toContain(userWithoutPermission.id);

    const notification = notifications.find((n) => n.userId === recipientWithView.id)!;
    expect(notification.type).toBe("VENDOR_ORDER_CONFIRMED");
    expect(notification.title).toBeTruthy();
    expect(notification.message).toContain(order.orderNumber);
    expect(notification.entityType).toBe("VendorOrder");
    expect(notification.entityId).toBe(order.id);
    expect(notification.readAt).toBeNull();
  });

  it("al rechazar: mismo criterio de destinatarios, type VENDOR_ORDER_REJECTED", async () => {
    const order = await createOrder("reject-1", "PENDING");

    const result = await rejectVendorOrder(order.id, {
      userId: actor.id,
      ipAddress: null,
      userAgent: null,
      reason: "Motivo de prueba",
    });
    expect(result.ok).toBe(true);

    const notifications = await prisma.notification.findMany({
      where: { entityType: "VendorOrder", entityId: order.id },
    });
    const notification = notifications.find((n) => n.userId === recipientWithView.id);
    expect(notification).toBeDefined();
    expect(notification?.type).toBe("VENDOR_ORDER_REJECTED");
    expect(notifications.some((n) => n.userId === actor.id)).toBe(false);
  });

  it("al entregar: mismo criterio de destinatarios, type VENDOR_ORDER_DELIVERED", async () => {
    const order = await createOrder("deliver-1", "CONFIRMED");

    const result = await deliverVendorOrder(order.id, {
      userId: actor.id,
      ipAddress: null,
      userAgent: null,
    });
    expect(result.ok).toBe(true);

    const notifications = await prisma.notification.findMany({
      where: { entityType: "VendorOrder", entityId: order.id },
    });
    const notification = notifications.find((n) => n.userId === recipientWithView.id);
    expect(notification).toBeDefined();
    expect(notification?.type).toBe("VENDOR_ORDER_DELIVERED");
    expect(notifications.some((n) => n.userId === actor.id)).toBe(false);
  });

  it("atomicidad: si falla la creación de notificaciones, se revierte toda la transacción", async () => {
    const order = await createOrder("atomic-1", "PENDING");

    vi.mocked(createNotificationModule.createNotifications).mockRejectedValueOnce(new Error("boom"));

    await expect(
      confirmVendorOrder(order.id, { userId: actor.id, ipAddress: null, userAgent: null }),
    ).rejects.toThrow("boom");

    const persisted = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.status).toBe("PENDING");

    const history = await prisma.vendorOrderStatusHistory.count({ where: { vendorOrderId: order.id } });
    const auditLogs = await prisma.auditLog.count({ where: { entityId: order.id } });
    const notifications = await prisma.notification.count({ where: { entityId: order.id } });
    expect(history).toBe(0);
    expect(auditLogs).toBe(0);
    expect(notifications).toBe(0);

    // La siguiente llamada real (sin el mock de fallo) debe funcionar normalmente.
    const result = await confirmVendorOrder(order.id, { userId: actor.id, ipAddress: null, userAgent: null });
    expect(result.ok).toBe(true);
  });
});
