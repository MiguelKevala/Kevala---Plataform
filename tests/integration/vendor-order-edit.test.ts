import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  editVendorOrder,
  type VendorOrderOperationalFields,
} from "@/modules/vendor/services/vendor-order-crud.service";
import { createCarrier, setCarrierActive } from "@/modules/carriers/service/carrier-crud.service";
import { createMode } from "@/modules/modes/service/mode-crud.service";

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

describe("Vendor Order editing (Fase 8)", () => {
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

  async function createOrder(suffix: string, overrides: Partial<VendorOrderOperationalFields> = {}) {
    const fields: VendorOrderOperationalFields = {
      orderDate: new Date("2026-01-01"),
      confirmationDeadline: new Date("2026-01-10"),
      deliveryDeadline: null,
      carrierId: carrierAId,
      modeId: modeAId,
      invoiceNumber: 100,
      cartonLabels: false,
      bol: false,
      palletLabels: false,
      upsLabels: false,
      ontracLabels: false,
      amzx: false,
      asn: false,
      ...overrides,
    };

    const order = await prisma.vendorOrder.create({
      data: { orderNumber: `${ORDER_PREFIX}${suffix}`, status: "PENDING", ...fields },
    });
    createdOrderIds.push(order.id);
    return order;
  }

  it("edita los campos operativos permitidos", async () => {
    const order = await createOrder("1");

    const result = await editVendorOrder(
      order.id,
      {
        orderDate: order.orderDate,
        confirmationDeadline: order.confirmationDeadline,
        deliveryDeadline: new Date("2026-02-01"),
        carrierId: carrierBId,
        modeId: modeBId,
        invoiceNumber: 999,
        cartonLabels: true,
        bol: true,
        palletLabels: false,
        upsLabels: false,
        ontracLabels: false,
        amzx: false,
        asn: false,
      },
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.carrierId).toBe(carrierBId);
    expect(result.order.modeId).toBe(modeBId);
    expect(result.order.invoiceNumber).toBe(999);
    expect(result.order.cartonLabels).toBe(true);
    expect(result.order.deliveryDeadline?.toISOString()).toBe(new Date("2026-02-01").toISOString());
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
      {
        orderDate: order.orderDate,
        confirmationDeadline: null,
        deliveryDeadline: null,
        carrierId: carrierAId,
        modeId: modeAId,
        invoiceNumber: 555,
        cartonLabels: true,
        bol: false,
        palletLabels: false,
        upsLabels: false,
        ontracLabels: false,
        amzx: false,
        asn: false,
      },
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe("CONFIRMED");
    expect(result.order.confirmedAt?.toISOString()).toBe(new Date("2026-01-05").toISOString());
    expect(result.order.rejectedAt).toBeNull();
    expect(result.order.deliveredAt).toBeNull();
  });

  it("registra un AuditLog VENDOR_ORDER_UPDATED con diff-only (no dump completo)", async () => {
    const order = await createOrder("3", { invoiceNumber: 100, cartonLabels: false });

    const result = await editVendorOrder(
      order.id,
      {
        orderDate: order.orderDate,
        confirmationDeadline: order.confirmationDeadline,
        deliveryDeadline: order.deliveryDeadline,
        carrierId: order.carrierId!,
        modeId: order.modeId!,
        invoiceNumber: 777,
        cartonLabels: true,
        bol: order.bol,
        palletLabels: order.palletLabels,
        upsLabels: order.upsLabels,
        ontracLabels: order.ontracLabels,
        amzx: order.amzx,
        asn: order.asn,
      },
      ctx(),
    );
    expect(result.ok).toBe(true);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "VendorOrder", entityId: order.id, action: "VENDOR_ORDER_UPDATED" },
    });
    expect(log).toBeTruthy();
    expect(log?.oldValues).toEqual({ invoiceNumber: 100, cartonLabels: false });
    expect(log?.newValues).toEqual({ invoiceNumber: 777, cartonLabels: true });
  });

  it("sin cambios reales: no crea AuditLog", async () => {
    const order = await createOrder("4", { invoiceNumber: 42 });

    const beforeCount = await prisma.auditLog.count({ where: { entityType: "VendorOrder", entityId: order.id } });

    const result = await editVendorOrder(
      order.id,
      {
        orderDate: order.orderDate,
        confirmationDeadline: order.confirmationDeadline,
        deliveryDeadline: order.deliveryDeadline,
        carrierId: order.carrierId!,
        modeId: order.modeId!,
        invoiceNumber: order.invoiceNumber,
        cartonLabels: order.cartonLabels,
        bol: order.bol,
        palletLabels: order.palletLabels,
        upsLabels: order.upsLabels,
        ontracLabels: order.ontracLabels,
        amzx: order.amzx,
        asn: order.asn,
      },
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
      {
        orderDate: order.orderDate,
        confirmationDeadline: order.confirmationDeadline,
        deliveryDeadline: order.deliveryDeadline,
        carrierId: order.carrierId!,
        modeId: order.modeId!,
        invoiceNumber: 321,
        cartonLabels: true,
        bol: order.bol,
        palletLabels: order.palletLabels,
        upsLabels: order.upsLabels,
        ontracLabels: order.ontracLabels,
        amzx: order.amzx,
        asn: order.asn,
      },
      ctx(),
    );

    const history = await prisma.vendorOrderStatusHistory.count({ where: { vendorOrderId: order.id } });
    expect(history).toBe(0);
  });

  it("rechaza cambiar a un carrier inactivo (INACTIVE_CARRIER)", async () => {
    const order = await createOrder("6");

    const result = await editVendorOrder(
      order.id,
      {
        orderDate: order.orderDate,
        confirmationDeadline: order.confirmationDeadline,
        deliveryDeadline: order.deliveryDeadline,
        carrierId: inactiveCarrierId,
        modeId: order.modeId!,
        invoiceNumber: order.invoiceNumber,
        cartonLabels: order.cartonLabels,
        bol: order.bol,
        palletLabels: order.palletLabels,
        upsLabels: order.upsLabels,
        ontracLabels: order.ontracLabels,
        amzx: order.amzx,
        asn: order.asn,
      },
      ctx(),
    );

    expect(result).toEqual({ ok: false, error: "INACTIVE_CARRIER" });
  });

  it("permite editar otros campos dejando intacto un carrier que ya estaba asignado y ahora está inactivo", async () => {
    const order = await createOrder("7", { carrierId: inactiveCarrierId });

    const result = await editVendorOrder(
      order.id,
      {
        orderDate: order.orderDate,
        confirmationDeadline: order.confirmationDeadline,
        deliveryDeadline: order.deliveryDeadline,
        carrierId: inactiveCarrierId,
        modeId: order.modeId!,
        invoiceNumber: 888,
        cartonLabels: order.cartonLabels,
        bol: order.bol,
        palletLabels: order.palletLabels,
        upsLabels: order.upsLabels,
        ontracLabels: order.ontracLabels,
        amzx: order.amzx,
        asn: order.asn,
      },
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.invoiceNumber).toBe(888);
  });

  it("devuelve NOT_FOUND para una orden inexistente", async () => {
    const result = await editVendorOrder(
      "does-not-exist",
      {
        orderDate: new Date(),
        confirmationDeadline: null,
        deliveryDeadline: null,
        carrierId: carrierAId,
        modeId: modeAId,
        invoiceNumber: null,
        cartonLabels: false,
        bol: false,
        palletLabels: false,
        upsLabels: false,
        ontracLabels: false,
        amzx: false,
        asn: false,
      },
      ctx(),
    );

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
