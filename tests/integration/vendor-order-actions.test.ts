import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { VendorOrderStatus } from "@/generated/prisma/client";
import {
  confirmVendorOrder,
  deliverVendorOrder,
  rejectVendorOrder,
  type VendorOrderActionContext,
} from "@/modules/vendor/services/vendor-order-actions.service";

const ORDER_PREFIX = "VACTION-";
const USER_EMAIL = "vendor-action-test@kevala.test";

const createdOrderIds: string[] = [];

let actorId: string;
let ctx: VendorOrderActionContext;

async function createOrder(status: VendorOrderStatus, suffix: string) {
  const order = await prisma.vendorOrder.create({
    data: {
      orderNumber: `${ORDER_PREFIX}${suffix}`,
      status,
      orderDate: new Date("2026-01-01"),
      ...(status === "CONFIRMED" || status === "DELIVERED"
        ? { confirmedAt: new Date("2026-01-02") }
        : {}),
      ...(status === "DELIVERED" ? { deliveredAt: new Date("2026-01-03") } : {}),
      ...(status === "REJECTED" ? { rejectedAt: new Date("2026-01-02") } : {}),
    },
  });
  createdOrderIds.push(order.id);
  return order;
}

async function cleanup() {
  if (createdOrderIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { module: "vendor", entityType: "VendorOrder", entityId: { in: createdOrderIds } },
    });
  }
  await prisma.vendorOrder.deleteMany({ where: { orderNumber: { startsWith: ORDER_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
}

describe("Vendor order actions (Fase 6)", () => {
  beforeAll(async () => {
    await cleanup();
    createdOrderIds.length = 0;

    const actor = await prisma.user.create({
      data: { email: USER_EMAIL, passwordHash: "not-a-real-hash", name: "Vendor Action Tester" },
    });
    actorId = actor.id;
    ctx = { userId: actorId, ipAddress: "127.0.0.1", userAgent: "vitest" };
  });

  afterAll(cleanup);

  describe("confirmVendorOrder", () => {
    it("PENDING -> CONFIRMED: actualiza estado, timestamp, historial y audit log", async () => {
      const order = await createOrder("PENDING", "C-ok");
      const before = new Date();

      const result = await confirmVendorOrder(order.id, ctx);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.order.status).toBe("CONFIRMED");
      expect(result.order.confirmedAt).not.toBeNull();
      expect(result.order.confirmedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());

      const history = await prisma.vendorOrderStatusHistory.findMany({
        where: { vendorOrderId: order.id },
      });
      expect(history).toHaveLength(1);
      expect(history[0].previousStatus).toBe("PENDING");
      expect(history[0].newStatus).toBe("CONFIRMED");
      expect(history[0].changedBy).toBe(actorId);
      expect(history[0].reason).toBeNull();
      expect(history[0].comments).toBeNull();

      const auditLogs = await prisma.auditLog.findMany({
        where: { module: "vendor", entityType: "VendorOrder", entityId: order.id },
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe("VENDOR_ORDER_CONFIRMED");
      expect(auditLogs[0].userId).toBe(actorId);
      expect(auditLogs[0].oldValues).toEqual({ status: "PENDING" });
      expect(auditLogs[0].newValues).toEqual({ status: "CONFIRMED" });
      expect(auditLogs[0].ipAddress).toBe("127.0.0.1");
      expect(auditLogs[0].userAgent).toBe("vitest");
    });

    it("CONFIRMED -> CONFIRMED: rechazado con CONFLICT y sin efectos secundarios", async () => {
      const order = await createOrder("CONFIRMED", "C-already-confirmed");

      const result = await confirmVendorOrder(order.id, ctx);

      expect(result).toEqual({ ok: false, error: "CONFLICT", currentStatus: "CONFIRMED" });

      const history = await prisma.vendorOrderStatusHistory.count({
        where: { vendorOrderId: order.id },
      });
      const auditLogs = await prisma.auditLog.count({
        where: { module: "vendor", entityType: "VendorOrder", entityId: order.id },
      });
      expect(history).toBe(0);
      expect(auditLogs).toBe(0);
    });

    it("REJECTED -> CONFIRMED: rechazado con CONFLICT", async () => {
      const order = await createOrder("REJECTED", "C-from-rejected");
      const result = await confirmVendorOrder(order.id, ctx);
      expect(result).toEqual({ ok: false, error: "CONFLICT", currentStatus: "REJECTED" });
    });

    it("DELIVERED -> CONFIRMED: rechazado con CONFLICT", async () => {
      const order = await createOrder("DELIVERED", "C-from-delivered");
      const result = await confirmVendorOrder(order.id, ctx);
      expect(result).toEqual({ ok: false, error: "CONFLICT", currentStatus: "DELIVERED" });
    });

    it("orden inexistente: NOT_FOUND", async () => {
      const result = await confirmVendorOrder("does-not-exist", ctx);
      expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    });
  });

  describe("rejectVendorOrder", () => {
    it("PENDING -> REJECTED: guarda motivo y comentarios en el historial y el audit log", async () => {
      const order = await createOrder("PENDING", "R-ok");

      const result = await rejectVendorOrder(order.id, {
        ...ctx,
        reason: "Stock insuficiente",
        comments: "Cliente notificado",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.order.status).toBe("REJECTED");
      expect(result.order.rejectedAt).not.toBeNull();

      const history = await prisma.vendorOrderStatusHistory.findMany({
        where: { vendorOrderId: order.id },
      });
      expect(history).toHaveLength(1);
      expect(history[0].previousStatus).toBe("PENDING");
      expect(history[0].newStatus).toBe("REJECTED");
      expect(history[0].reason).toBe("Stock insuficiente");
      expect(history[0].comments).toBe("Cliente notificado");

      const auditLogs = await prisma.auditLog.findMany({
        where: { module: "vendor", entityType: "VendorOrder", entityId: order.id },
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe("VENDOR_ORDER_REJECTED");
      expect(auditLogs[0].oldValues).toEqual({ status: "PENDING" });
      expect(auditLogs[0].newValues).toEqual({ status: "REJECTED" });
    });

    it("PENDING -> REJECTED sin comentarios: comments queda null", async () => {
      const order = await createOrder("PENDING", "R-no-comments");
      const result = await rejectVendorOrder(order.id, { ...ctx, reason: "Motivo sin comentarios" });
      expect(result.ok).toBe(true);

      const history = await prisma.vendorOrderStatusHistory.findFirst({
        where: { vendorOrderId: order.id },
      });
      expect(history?.comments).toBeNull();
    });

    it("CONFIRMED -> REJECTED: rechazado con CONFLICT", async () => {
      const order = await createOrder("CONFIRMED", "R-from-confirmed");
      const result = await rejectVendorOrder(order.id, { ...ctx, reason: "Motivo" });
      expect(result).toEqual({ ok: false, error: "CONFLICT", currentStatus: "CONFIRMED" });
    });

    it("REJECTED -> REJECTED: rechazado con CONFLICT", async () => {
      const order = await createOrder("REJECTED", "R-already-rejected");
      const result = await rejectVendorOrder(order.id, { ...ctx, reason: "Motivo" });
      expect(result).toEqual({ ok: false, error: "CONFLICT", currentStatus: "REJECTED" });
    });
  });

  describe("deliverVendorOrder", () => {
    it("CONFIRMED -> DELIVERED: actualiza estado, timestamp, historial y audit log", async () => {
      const order = await createOrder("CONFIRMED", "D-ok");

      const result = await deliverVendorOrder(order.id, ctx);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.order.status).toBe("DELIVERED");
      expect(result.order.deliveredAt).not.toBeNull();

      const history = await prisma.vendorOrderStatusHistory.findFirst({
        where: { vendorOrderId: order.id },
      });
      expect(history?.previousStatus).toBe("CONFIRMED");
      expect(history?.newStatus).toBe("DELIVERED");
      expect(history?.reason).toBeNull();
      expect(history?.comments).toBeNull();

      const auditLog = await prisma.auditLog.findFirst({
        where: { module: "vendor", entityType: "VendorOrder", entityId: order.id },
      });
      expect(auditLog?.action).toBe("VENDOR_ORDER_DELIVERED");
      expect(auditLog?.oldValues).toEqual({ status: "CONFIRMED" });
      expect(auditLog?.newValues).toEqual({ status: "DELIVERED" });
    });

    it("PENDING -> DELIVERED: rechazado con CONFLICT", async () => {
      const order = await createOrder("PENDING", "D-from-pending");
      const result = await deliverVendorOrder(order.id, ctx);
      expect(result).toEqual({ ok: false, error: "CONFLICT", currentStatus: "PENDING" });
    });

    it("REJECTED -> DELIVERED: rechazado con CONFLICT", async () => {
      const order = await createOrder("REJECTED", "D-from-rejected");
      const result = await deliverVendorOrder(order.id, ctx);
      expect(result).toEqual({ ok: false, error: "CONFLICT", currentStatus: "REJECTED" });
    });

    it("DELIVERED -> DELIVERED: rechazado con CONFLICT", async () => {
      const order = await createOrder("DELIVERED", "D-already-delivered");
      const result = await deliverVendorOrder(order.id, ctx);
      expect(result).toEqual({ ok: false, error: "CONFLICT", currentStatus: "DELIVERED" });
    });
  });

  describe("concurrencia", () => {
    it("dos transiciones simultáneas sobre la misma orden PENDING: solo una gana", async () => {
      const order = await createOrder("PENDING", "RACE-1");

      const [confirmResult, rejectResult] = await Promise.all([
        confirmVendorOrder(order.id, ctx),
        rejectVendorOrder(order.id, { ...ctx, reason: "Intento concurrente" }),
      ]);

      const results = [confirmResult, rejectResult];
      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({ ok: false, error: "CONFLICT" });

      const finalOrder = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(["CONFIRMED", "REJECTED"]).toContain(finalOrder.status);

      const historyCount = await prisma.vendorOrderStatusHistory.count({
        where: { vendorOrderId: order.id },
      });
      const auditLogCount = await prisma.auditLog.count({
        where: { module: "vendor", entityType: "VendorOrder", entityId: order.id },
      });
      expect(historyCount).toBe(1);
      expect(auditLogCount).toBe(1);

      // Nunca debe quedar REJECTED después de haber sido confirmada, ni viceversa:
      // el historial único debe coincidir exactamente con el resultado que ganó la carrera.
      const history = await prisma.vendorOrderStatusHistory.findFirstOrThrow({
        where: { vendorOrderId: order.id },
      });
      expect(history.newStatus).toBe(finalOrder.status);
    });
  });
});
