import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { VendorOrderStatus } from "@/generated/prisma/client";
import {
  confirmVendorOrder,
  deliverVendorOrder,
  rejectVendorOrder,
  type VendorOrderActionContext,
} from "@/modules/vendor/services/vendor-order-actions.service";
import { createCarrier } from "@/modules/carriers/service/carrier-crud.service";
import { createMode } from "@/modules/modes/service/mode-crud.service";

const ORDER_PREFIX = "VACTION-";
const CARRIER_PREFIX = "TEST-VACTION-CARRIER-";
const MODE_PREFIX = "TEST-VACTION-MODE-";
const USER_EMAIL = "vendor-action-test@kevala.test";

const createdOrderIds: string[] = [];
const createdCarrierIds: string[] = [];
const createdModeIds: string[] = [];

let actorId: string;
let ctx: VendorOrderActionContext;
let carrierId: string;
let modeId: string;

interface OrderOverrides {
  tracking?: string | null;
  carrierId?: string | null;
  modeId?: string | null;
  confirmationDeadline?: Date | null;
  deliveryDeadline?: Date | null;
  deliveryDate?: Date | null;
  pickUpDate?: Date | null;
  shipmentDate?: Date | null;
  invoiceNumber?: number | null;
  packingSlip?: boolean | null;
  cartonLabels?: boolean | null;
  bol?: boolean | null;
  palletLabels?: boolean | null;
  asn?: boolean | null;
  carrierLabels?: boolean | null;
  carrierLabelType?: string | null;
}

async function createOrder(status: VendorOrderStatus, suffix: string, overrides: OrderOverrides = {}) {
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
      ...overrides,
    },
  });
  createdOrderIds.push(order.id);
  return order;
}

/** Orden CONFIRMED con toda la información requerida completa y consistente
 * (lista para DELIVERED), usada como base para los tests de completitud. */
async function createCompleteConfirmedOrder(suffix: string, overrides: OrderOverrides = {}) {
  return createOrder("CONFIRMED", suffix, {
    tracking: "1Z999AA10123456784",
    carrierId,
    modeId,
    confirmationDeadline: new Date("2026-01-03"),
    deliveryDeadline: new Date("2026-01-05"),
    deliveryDate: new Date("2026-01-04"),
    pickUpDate: new Date("2026-01-02"),
    shipmentDate: new Date("2026-01-01"),
    invoiceNumber: 4242,
    packingSlip: true,
    cartonLabels: true,
    bol: true,
    palletLabels: true,
    asn: true,
    carrierLabels: false,
    carrierLabelType: null,
    ...overrides,
  });
}

async function cleanup() {
  if (createdOrderIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { module: "vendor", entityType: "VendorOrder", entityId: { in: createdOrderIds } },
    });
  }
  await prisma.vendorOrder.deleteMany({ where: { orderNumber: { startsWith: ORDER_PREFIX } } });

  if (createdCarrierIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { entityType: "Carrier", entityId: { in: createdCarrierIds } } });
  }
  await prisma.carrier.deleteMany({ where: { name: { startsWith: CARRIER_PREFIX } } });

  if (createdModeIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { entityType: "Mode", entityId: { in: createdModeIds } } });
  }
  await prisma.mode.deleteMany({ where: { name: { startsWith: MODE_PREFIX } } });

  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
}

describe("Vendor order actions (Fase 6 / Fase 8.1)", () => {
  beforeAll(async () => {
    await cleanup();
    createdOrderIds.length = 0;
    createdCarrierIds.length = 0;
    createdModeIds.length = 0;

    const actor = await prisma.user.create({
      data: { email: USER_EMAIL, passwordHash: "not-a-real-hash", name: "Vendor Action Tester" },
    });
    actorId = actor.id;
    ctx = { userId: actorId, ipAddress: "127.0.0.1", userAgent: "vitest" };

    const carrier = await createCarrier(`${CARRIER_PREFIX}A`, ctx);
    if (carrier.ok) {
      carrierId = carrier.carrier.id;
      createdCarrierIds.push(carrierId);
    }

    const mode = await createMode(`${MODE_PREFIX}A`, ctx);
    if (mode.ok) {
      modeId = mode.mode.id;
      createdModeIds.push(modeId);
    }
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
    it("CONFIRMED -> DELIVERED: actualiza estado, timestamp, historial y audit log (con checklist completo)", async () => {
      const order = await createCompleteConfirmedOrder("D-ok");

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

    describe("completitud del Shipping Checklist (Fase 8.1)", () => {
      it("Tracking faltante -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-tracking", { tracking: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Tracking");
        }
      });

      it("Tracking vacío -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-empty-tracking", { tracking: "   " });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Tracking");
        }
      });

      it("Tracking válido con todo lo demás completo -> permitido", async () => {
        const order = await createCompleteConfirmedOrder("D-valid-tracking");
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result.ok).toBe(true);
      });

      it("Carrier faltante -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-carrier", { carrierId: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Carrier");
        }
      });

      it("Mode faltante -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-mode", { modeId: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Mode");
        }
      });

      it("Carton Labels null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-carton", { cartonLabels: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Carton Labels");
        }
      });

      it("BOL null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-bol", { bol: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("BOL");
        }
      });

      it("Pallet Labels null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-pallet", { palletLabels: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Pallet Labels");
        }
      });

      it("ASN null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-asn", { asn: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("ASN");
        }
      });

      it("Carrier Labels null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-carrier-labels", { carrierLabels: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Carrier Labels");
        }
      });

      it("Carrier Labels = Yes sin tipo -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-yes-no-type", {
          carrierLabels: true,
          carrierLabelType: null,
        });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Carrier Label Type");
        }
      });

      it("Carrier Labels = No + BOL = No -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-labels-no-bol", {
          carrierLabels: false,
          bol: false,
        });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("BOL");
        }
      });

      it("Carrier Labels = No + BOL = Yes -> permitido", async () => {
        const order = await createCompleteConfirmedOrder("D-no-labels-yes-bol", {
          carrierLabels: false,
          bol: true,
        });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result.ok).toBe(true);
      });

      it("Carrier Labels = Yes + UPS -> permitido", async () => {
        const order = await createCompleteConfirmedOrder("D-labels-ups", {
          carrierLabels: true,
          carrierLabelType: "UPS",
        });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result.ok).toBe(true);
      });

      it("Carrier Labels = Yes + OnTrac -> permitido", async () => {
        const order = await createCompleteConfirmedOrder("D-labels-ontrac", {
          carrierLabels: true,
          carrierLabelType: "OnTrac",
        });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result.ok).toBe(true);
      });

      it("Carrier Labels = Yes + AMZX -> permitido", async () => {
        const order = await createCompleteConfirmedOrder("D-labels-amzx", {
          carrierLabels: true,
          carrierLabelType: "AMZX",
        });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result.ok).toBe(true);
      });

      it("Confirmation Deadline null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-conf-deadline", { confirmationDeadline: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Confirmation Deadline");
        }
      });

      it("Delivery Deadline null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-del-deadline", { deliveryDeadline: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Delivery Deadline");
        }
      });

      it("Delivery Date null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-delivery-date", { deliveryDate: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Delivery Date");
        }
      });

      it("Pick Up Date null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-pickup-date", { pickUpDate: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Pick Up Date");
        }
      });

      it("Shipment Date null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-shipment-date", { shipmentDate: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Shipment Date");
        }
      });

      it("Packing Slip null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-packing-slip", { packingSlip: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Packing Slip");
        }
      });

      it("Packing Slip = false -> permitido (false no es faltante)", async () => {
        const order = await createCompleteConfirmedOrder("D-packing-slip-false", { packingSlip: false });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result.ok).toBe(true);
      });

      it("Invoice # null -> rechazado con INCOMPLETE", async () => {
        const order = await createCompleteConfirmedOrder("D-no-invoice", { invoiceNumber: null });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toContain("Invoice #");
        }
      });

      it("múltiples campos faltantes -> INCOMPLETE lista todos los que faltan", async () => {
        const order = await createCompleteConfirmedOrder("D-multi-missing", {
          carrierId: null,
          modeId: null,
          tracking: null,
          deliveryDate: null,
          pickUpDate: null,
          shipmentDate: null,
          packingSlip: null,
        });
        const result = await deliverVendorOrder(order.id, ctx);
        expect(result).toMatchObject({ ok: false, error: "INCOMPLETE" });
        if (!result.ok && result.error === "INCOMPLETE") {
          expect(result.missingFields).toEqual(
            expect.arrayContaining([
              "Carrier",
              "Mode",
              "Tracking",
              "Delivery Date",
              "Pick Up Date",
              "Shipment Date",
              "Packing Slip",
            ]),
          );
        }
      });

      it("una orden incompleta no persiste ningún cambio (atomicidad del bloqueo)", async () => {
        const order = await createCompleteConfirmedOrder("D-incomplete-atomic", { tracking: null });
        await deliverVendorOrder(order.id, ctx);

        const persisted = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: order.id } });
        expect(persisted.status).toBe("CONFIRMED");
        expect(persisted.deliveredAt).toBeNull();

        const history = await prisma.vendorOrderStatusHistory.count({ where: { vendorOrderId: order.id } });
        expect(history).toBe(0);
      });
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
