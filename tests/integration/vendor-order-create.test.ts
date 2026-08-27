import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createVendorOrder, type CreateVendorOrderInput } from "@/modules/vendor/services/vendor-order-crud.service";
import { createCarrier, setCarrierActive } from "@/modules/carriers/service/carrier-crud.service";
import { createMode, setModeActive } from "@/modules/modes/service/mode-crud.service";

const ORDER_PREFIX = "VCREATE-";
const CARRIER_PREFIX = "TEST-VCREATE-CARRIER-";
const MODE_PREFIX = "TEST-VCREATE-MODE-";
const EMAIL_PREFIX = "vendor-create-test";

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

describe("Vendor Order creation (Fase 8)", () => {
  let actor: { id: string };
  let activeCarrierId: string;
  let activeModeId: string;
  let inactiveCarrierId: string;
  let inactiveModeId: string;

  beforeAll(async () => {
    await cleanup();

    actor = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}@kevala.test`, passwordHash: "not-a-real-hash", name: "Vendor Create Test Actor" },
    });

    const ctx = { userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" };

    const carrier = await createCarrier(`${CARRIER_PREFIX}ACTIVE`, ctx);
    if (carrier.ok) {
      activeCarrierId = carrier.carrier.id;
      createdCarrierIds.push(carrier.carrier.id);
    }

    const mode = await createMode(`${MODE_PREFIX}ACTIVE`, ctx);
    if (mode.ok) {
      activeModeId = mode.mode.id;
      createdModeIds.push(mode.mode.id);
    }

    const inactiveCarrier = await createCarrier(`${CARRIER_PREFIX}INACTIVE`, ctx);
    if (inactiveCarrier.ok) {
      inactiveCarrierId = inactiveCarrier.carrier.id;
      createdCarrierIds.push(inactiveCarrier.carrier.id);
      await setCarrierActive(inactiveCarrierId, false, ctx);
    }

    const inactiveMode = await createMode(`${MODE_PREFIX}INACTIVE`, ctx);
    if (inactiveMode.ok) {
      inactiveModeId = inactiveMode.mode.id;
      createdModeIds.push(inactiveMode.mode.id);
      await setModeActive(inactiveModeId, false, ctx);
    }
  });

  afterAll(cleanup);

  function baseInput(orderNumber: string): CreateVendorOrderInput {
    return {
      orderNumber,
      orderDate: new Date("2026-01-01"),
      carrierId: activeCarrierId,
      modeId: activeModeId,
      tracking: "1Z999AA10123456784",
      deliveryDate: null,
      pickUpDate: null,
      shipmentDate: null,
      invoiceNumber: 1042,
      cartonLabels: true,
      bol: false,
      palletLabels: true,
      asn: false,
      carrierLabels: true,
      carrierLabelType: "AMZX",
      packingSlip: null,
    };
  }

  const ctx = () => ({ userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" });

  it("crea la orden con status PENDING, checklist e invoice tal como se envían", async () => {
    const result = await createVendorOrder(baseInput(`${ORDER_PREFIX}1`), ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);

    expect(result.order.status).toBe("PENDING");
    expect(result.order.carrierId).toBe(activeCarrierId);
    expect(result.order.modeId).toBe(activeModeId);
    expect(result.order.tracking).toBe("1Z999AA10123456784");
    expect(result.order.invoiceNumber).toBe(1042);
    expect(result.order.cartonLabels).toBe(true);
    expect(result.order.bol).toBe(false);
    expect(result.order.carrierLabels).toBe(true);
    expect(result.order.carrierLabelType).toBe("AMZX");
  });

  it("acepta Tracking alfanumérico con letras, números y guiones", async () => {
    for (const [suffix, tracking] of [
      ["TRACK-LETTERS", "ABCDEFG"],
      ["TRACK-NUMBERS", "123456789"],
      ["TRACK-MIXED", "TBA123456789"],
      ["TRACK-HYPHEN", "AMZ-123456789"],
    ] as const) {
      const result = await createVendorOrder(
        { ...baseInput(`${ORDER_PREFIX}${suffix}`), tracking },
        ctx(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        createdOrderIds.push(result.order.id);
        expect(result.order.tracking).toBe(tracking);
      }
    }
  });

  it("Tracking es opcional (null) al crear", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}NO-TRACKING`), tracking: null },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      createdOrderIds.push(result.order.id);
      expect(result.order.tracking).toBeNull();
    }
  });

  it("crea el VendorOrderStatusHistory inicial (previousStatus null -> PENDING)", async () => {
    const result = await createVendorOrder(baseInput(`${ORDER_PREFIX}2`), ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);

    const history = await prisma.vendorOrderStatusHistory.findMany({
      where: { vendorOrderId: result.order.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0].previousStatus).toBeNull();
    expect(history[0].newStatus).toBe("PENDING");
    expect(history[0].changedBy).toBe(actor.id);
  });

  it("crea un AuditLog VENDOR_ORDER_CREATED con los datos capturados", async () => {
    const result = await createVendorOrder(baseInput(`${ORDER_PREFIX}3`), ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "VendorOrder", entityId: result.order.id, action: "VENDOR_ORDER_CREATED" },
    });
    expect(log).toBeTruthy();
    expect(log?.module).toBe("vendor");
    expect(log?.oldValues).toBeNull();
    expect((log?.newValues as Record<string, unknown>)?.carrierId).toBe(activeCarrierId);
  });

  it("el checklist puede quedar sin capturar (null), distinto de false", async () => {
    const input: CreateVendorOrderInput = {
      ...baseInput(`${ORDER_PREFIX}4`),
      cartonLabels: null,
      bol: null,
      palletLabels: null,
      asn: null,
      carrierLabels: null,
      carrierLabelType: null,
    };
    const result = await createVendorOrder(input, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);

    expect(result.order.cartonLabels).toBeNull();
    expect(result.order.bol).toBeNull();
    expect(result.order.palletLabels).toBeNull();
    expect(result.order.asn).toBeNull();
    expect(result.order.carrierLabels).toBeNull();
  });

  it("rechaza una combinación inconsistente de Carrier Labels/BOL con CHECKLIST_INVALID", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}INVALID-CHECKLIST`), carrierLabels: false, carrierLabelType: null, bol: false },
      ctx(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("CHECKLIST_INVALID");

    const order = await prisma.vendorOrder.findUnique({
      where: { orderNumber: `${ORDER_PREFIX}INVALID-CHECKLIST` },
    });
    expect(order).toBeNull();
  });

  it("invoiceNumber es opcional (null)", async () => {
    const result = await createVendorOrder({ ...baseInput(`${ORDER_PREFIX}5`), invoiceNumber: null }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);
    expect(result.order.invoiceNumber).toBeNull();
  });

  it("rechaza un PO # duplicado con DUPLICATE_ORDER_NUMBER, sin dejar restos", async () => {
    const first = await createVendorOrder(baseInput(`${ORDER_PREFIX}DUP`), ctx());
    expect(first.ok).toBe(true);
    if (first.ok) createdOrderIds.push(first.order.id);

    const second = await createVendorOrder(baseInput(`${ORDER_PREFIX}DUP`), ctx());
    expect(second).toEqual({ ok: false, error: "DUPLICATE_ORDER_NUMBER" });
  });

  it("rechaza un carrier inactivo con INACTIVE_CARRIER, sin crear la orden", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}INACTIVE-CARRIER`), carrierId: inactiveCarrierId },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "INACTIVE_CARRIER" });

    const order = await prisma.vendorOrder.findUnique({
      where: { orderNumber: `${ORDER_PREFIX}INACTIVE-CARRIER` },
    });
    expect(order).toBeNull();
  });

  it("rechaza un mode inactivo con INACTIVE_MODE", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}INACTIVE-MODE`), modeId: inactiveModeId },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "INACTIVE_MODE" });
  });

  it("rechaza un carrier inexistente con CARRIER_NOT_FOUND", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}NO-CARRIER`), carrierId: "does-not-exist" },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "CARRIER_NOT_FOUND" });
  });

  it("rechaza un mode inexistente con MODE_NOT_FOUND", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}NO-MODE`), modeId: "does-not-exist" },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "MODE_NOT_FOUND" });
  });

  it("crea la orden sin carrier (carrierId null) -> PENDING, carrierId null", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}NO-CARRIER-OK`), carrierId: null },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);
    expect(result.order.carrierId).toBeNull();
  });

  it("crea la orden sin mode (modeId null) -> PENDING, modeId null", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}NO-MODE-OK`), modeId: null },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);
    expect(result.order.modeId).toBeNull();
  });

  it("crea la orden sin carrier ni mode (ambos null)", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}NO-CARRIER-NO-MODE`), carrierId: null, modeId: null },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);
    expect(result.order.carrierId).toBeNull();
    expect(result.order.modeId).toBeNull();
  });

  it("Confirmation Deadline se calcula automáticamente como Order Date + 2 días", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}DEADLINE-CONF`), orderDate: new Date("2026-02-10T00:00:00.000Z") },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);
    expect(result.order.confirmationDeadline?.toISOString()).toBe("2026-02-12T00:00:00.000Z");
  });

  it("Delivery Deadline se calcula automáticamente como Order Date + 4 días", async () => {
    const result = await createVendorOrder(
      { ...baseInput(`${ORDER_PREFIX}DEADLINE-DEL`), orderDate: new Date("2026-02-10T00:00:00.000Z") },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push(result.order.id);
    expect(result.order.deliveryDeadline?.toISOString()).toBe("2026-02-14T00:00:00.000Z");
  });
});
