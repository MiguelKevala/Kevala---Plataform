import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  editVendorOrder,
  type VendorOrderOperationalFields,
} from "@/modules/vendor/services/vendor-order-crud.service";
import { createCarrier, setCarrierActive } from "@/modules/carriers/service/carrier-crud.service";
import { createMode } from "@/modules/modes/service/mode-crud.service";
import {
  computeConfirmationDeadline,
  computeDeliveryDeadline,
} from "@/modules/vendor/domain/vendor-order-deadlines";

const ORDER_PREFIX = "VEDIT-";
const CARRIER_PREFIX = "TEST-VEDIT-CARRIER-";
const MODE_PREFIX = "TEST-VEDIT-MODE-";
const EMAIL_PREFIX = "vendor-edit-test";

const createdOrderIds: string[] = [];
const createdCarrierIds: string[] = [];
const createdModeIds: string[] = [];

async function cleanup() {
  if (createdOrderIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "VendorOrder", entityId: { in: createdOrderIds } },
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

  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });

  createdOrderIds.length = 0;
  createdCarrierIds.length = 0;
  createdModeIds.length = 0;
}

describe("Vendor Order editing (Fase 8.1)", () => {
  let actor: { id: string };
  let carrierAId: string;
  let carrierBId: string;
  let modeAId: string;
  let modeBId: string;
  let inactiveCarrierId: string;

  beforeAll(async () => {
    await cleanup();

    actor = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}@kevala.test`, passwordHash: "not-a-real-hash", name: "Vendor Edit Test Actor" },
    });

    const ctx = { userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" };

    const carrierA = await createCarrier(`${CARRIER_PREFIX}A`, ctx);
    if (carrierA.ok) { carrierAId = carrierA.carrier.id; createdCarrierIds.push(carrierAId); }
    const carrierB = await createCarrier(`${CARRIER_PREFIX}B`, ctx);
    if (carrierB.ok) { carrierBId = carrierB.carrier.id; createdCarrierIds.push(carrierBId); }
    const modeA = await createMode(`${MODE_PREFIX}A`, ctx);
    if (modeA.ok) { modeAId = modeA.mode.id; createdModeIds.push(modeAId); }
    const modeB = await createMode(`${MODE_PREFIX}B`, ctx);
    if (modeB.ok) { modeBId = modeB.mode.id; createdModeIds.push(modeBId); }

    const inactive = await createCarrier(`${CARRIER_PREFIX}INACTIVE`, ctx);
    if (inactive.ok) {
      inactiveCarrierId = inactive.carrier.id;
      createdCarrierIds.push(inactiveCarrierId);
      await setCarrierActive(inactiveCarrierId, false, ctx);
    }
  });

  afterAll(cleanup);

  const ctx = () => ({ userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" });

  function defaultFields(overrides: Partial<VendorOrderOperationalFields> = {}): VendorOrderOperationalFields {
    return {
      orderDate: new Date("2026-01-01"),
      carrierId: carrierAId,
      modeId: modeAId,
      tracking: null,
      deliveryDate: null,
      pickUpDate: null,
      shipmentDate: null,
      invoiceNumber: 100,
      cartonLabels: null,
      bol: null,
      palletLabels: null,
      asn: null,
      carrierLabels: null,
      carrierLabelType: null,
      packingSlip: null,
      ...overrides,
    };
  }

  async function createOrder(suffix: string, overrides: Partial<VendorOrderOperationalFields> = {}) {
    const fields = defaultFields(overrides);
    const order = await prisma.vendorOrder.create({
      data: {
        orderNumber: `${ORDER_PREFIX}${suffix}`,
        status: "PENDING",
        ...fields,
        // Reproduce lo que createVendorOrder haría realmente: las deadlines
        // siempre calculadas a partir de orderDate, nunca null en una orden
        // ya existente. Así el fixture no genera un diff artificial al editar.
        confirmationDeadline: computeConfirmationDeadline(fields.orderDate),
        deliveryDeadline: computeDeliveryDeadline(fields.orderDate),
      },
    });
    createdOrderIds.push(order.id);
    return order;
  }

  it("edita los campos operativos permitidos, incluyendo Tracking", async () => {
    const order = await createOrder("1");

    const result = await editVendorOrder(
      order.id,
      defaultFields({
        deliveryDate: new Date("2026-02-01"),
        pickUpDate: new Date("2026-01-30"),
        shipmentDate: new Date("2026-01-29"),
        carrierId: carrierBId,
        modeId: modeBId,
        tracking: "1Z999AA10123456784",
        invoiceNumber: 999,
        cartonLabels: true,
        bol: true,
        packingSlip: true,
      }),
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.carrierId).toBe(carrierBId);
    expect(result.order.modeId).toBe(modeBId);
    expect(result.order.tracking).toBe("1Z999AA10123456784");
    expect(result.order.invoiceNumber).toBe(999);
    expect(result.order.cartonLabels).toBe(true);
    expect(result.order.packingSlip).toBe(true);
    expect(result.order.deliveryDate?.toISOString()).toBe(new Date("2026-02-01").toISOString());
  });

  it("Confirmation/Delivery Deadline se recalculan cuando cambia Order Date en un edit", async () => {
    const order = await createOrder("ORDER-DATE-RECALC");

    const result = await editVendorOrder(
      order.id,
      defaultFields({
        orderDate: new Date("2026-03-05T00:00:00.000Z"),
        carrierId: order.carrierId!,
        modeId: order.modeId!,
      }),
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.confirmationDeadline?.toISOString()).toBe("2026-03-07T00:00:00.000Z");
    expect(result.order.deliveryDeadline?.toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });

  it("nunca modifica status, confirmedAt, rejectedAt ni deliveredAt", async () => {
    const order = await prisma.vendorOrder.create({
      data: {
        orderNumber: `${ORDER_PREFIX}2`,
        status: "CONFIRMED",
        orderDate: new Date("2026-01-01"),
        carrierId: carrierAId,
        modeId: modeAId,
        confirmedAt: new Date("2026-01-05"),
      },
    });
    createdOrderIds.push(order.id);

    const result = await editVendorOrder(
      order.id,
      defaultFields({ invoiceNumber: 555, cartonLabels: true }),
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe("CONFIRMED");
    expect(result.order.confirmedAt?.toISOString()).toBe(new Date("2026-01-05").toISOString());
    expect(result.order.rejectedAt).toBeNull();
    expect(result.order.deliveredAt).toBeNull();
  });

  it("registra un AuditLog VENDOR_ORDER_UPDATED con diff-only (no dump completo), incluye tracking cuando cambia", async () => {
    const order = await createOrder("3", { invoiceNumber: 100, cartonLabels: false, tracking: "OLD-TRACK" });

    const result = await editVendorOrder(
      order.id,
      defaultFields({
        carrierId: order.carrierId!,
        modeId: order.modeId!,
        tracking: "NEW-TRACK",
        invoiceNumber: 777,
        cartonLabels: true,
      }),
      ctx(),
    );
    expect(result.ok).toBe(true);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "VendorOrder", entityId: order.id, action: "VENDOR_ORDER_UPDATED" },
    });
    expect(log).toBeTruthy();
    expect(log?.oldValues).toEqual({ invoiceNumber: 100, cartonLabels: false, tracking: "OLD-TRACK" });
    expect(log?.newValues).toEqual({ invoiceNumber: 777, cartonLabels: true, tracking: "NEW-TRACK" });
  });

  it("sin cambios reales: no crea AuditLog", async () => {
    const order = await createOrder("4", { invoiceNumber: 42 });

    const beforeCount = await prisma.auditLog.count({ where: { entityType: "VendorOrder", entityId: order.id } });

    const result = await editVendorOrder(
      order.id,
      defaultFields({
        carrierId: order.carrierId!,
        modeId: order.modeId!,
        invoiceNumber: order.invoiceNumber,
      }),
      ctx(),
    );
    expect(result.ok).toBe(true);

    const afterCount = await prisma.auditLog.count({ where: { entityType: "VendorOrder", entityId: order.id } });
    expect(afterCount).toBe(beforeCount);
  });

  it("nunca crea una fila en VendorOrderStatusHistory", async () => {
    const order = await createOrder("5");

    await editVendorOrder(
      order.id,
      defaultFields({ carrierId: order.carrierId!, modeId: order.modeId!, invoiceNumber: 321, cartonLabels: true }),
      ctx(),
    );

    const history = await prisma.vendorOrderStatusHistory.count({ where: { vendorOrderId: order.id } });
    expect(history).toBe(0);
  });

  it("rechaza cambiar a un carrier inactivo (INACTIVE_CARRIER)", async () => {
    const order = await createOrder("6");

    const result = await editVendorOrder(
      order.id,
      defaultFields({ carrierId: inactiveCarrierId, modeId: order.modeId! }),
      ctx(),
    );

    expect(result).toEqual({ ok: false, error: "INACTIVE_CARRIER" });
  });

  it("permite editar otros campos dejando intacto un carrier que ya estaba asignado y ahora está inactivo", async () => {
    const order = await createOrder("7", { carrierId: inactiveCarrierId });

    const result = await editVendorOrder(
      order.id,
      defaultFields({ carrierId: inactiveCarrierId, modeId: order.modeId!, invoiceNumber: 888 }),
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.invoiceNumber).toBe(888);
  });

  it("rechaza una combinación inconsistente de Carrier Labels/BOL con CHECKLIST_INVALID, sin persistir el cambio", async () => {
    const order = await createOrder("8", { invoiceNumber: 1 });

    const result = await editVendorOrder(
      order.id,
      defaultFields({ carrierId: order.carrierId!, modeId: order.modeId!, invoiceNumber: 2, carrierLabels: false, bol: false }),
      ctx(),
    );

    expect(result).toEqual({
      ok: false,
      error: "CHECKLIST_INVALID",
      issues: expect.arrayContaining(["BOL"]),
    });

    const persisted = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.invoiceNumber).toBe(1);
  });

  it("acepta editar Tracking a un valor alfanumérico con guiones", async () => {
    const order = await createOrder("9");

    const result = await editVendorOrder(
      order.id,
      defaultFields({ carrierId: order.carrierId!, modeId: order.modeId!, tracking: "ONTRAC-123456789" }),
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.tracking).toBe("ONTRAC-123456789");
  });

  it("permite asignar carrier/mode más tarde a una orden creada sin ellos", async () => {
    const order = await createOrder("NO-CARRIER-MODE", { carrierId: null, modeId: null });
    expect(order.carrierId).toBeNull();
    expect(order.modeId).toBeNull();

    const result = await editVendorOrder(
      order.id,
      defaultFields({ carrierId: carrierAId, modeId: modeAId, invoiceNumber: 1234 }),
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.carrierId).toBe(carrierAId);
      expect(result.order.modeId).toBe(modeAId);
    }
  });

  it("permite dejar carrier/mode en null al editar (siguen siendo opcionales)", async () => {
    const order = await createOrder("UNSET-CARRIER-MODE");

    const result = await editVendorOrder(
      order.id,
      defaultFields({ carrierId: null, modeId: null, invoiceNumber: 4321 }),
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.carrierId).toBeNull();
      expect(result.order.modeId).toBeNull();
    }
  });

  it("devuelve NOT_FOUND para una orden inexistente", async () => {
    const result = await editVendorOrder(
      "does-not-exist",
      defaultFields({ carrierId: carrierAId, modeId: modeAId, invoiceNumber: null }),
      ctx(),
    );

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
