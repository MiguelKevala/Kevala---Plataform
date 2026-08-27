import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listCarriers } from "@/modules/carriers/repository/carrier.repository";
import { createCarrier, renameCarrier, setCarrierActive } from "@/modules/carriers/service/carrier-crud.service";

const NAME_PREFIX = "TEST-CARRIER-";
const EMAIL_PREFIX = "carrier-test";
const ORDER_PREFIX = "CARRTEST-";

const createdCarrierIds: string[] = [];
const createdOrderIds: string[] = [];

async function cleanup() {
  if (createdOrderIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "VendorOrder", entityId: { in: createdOrderIds } },
    });
  }
  await prisma.vendorOrder.deleteMany({ where: { orderNumber: { startsWith: ORDER_PREFIX } } });

  if (createdCarrierIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Carrier", entityId: { in: createdCarrierIds } },
    });
  }
  await prisma.carrier.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });

  createdCarrierIds.length = 0;
  createdOrderIds.length = 0;
}

describe("Carrier CRUD (Fase 8)", () => {
  let actor: { id: string };

  beforeAll(async () => {
    await cleanup();
    actor = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}@kevala.test`, passwordHash: "not-a-real-hash", name: "Carrier Test Actor" },
    });
  });

  afterAll(cleanup);

  const ctx = () => ({ userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" });

  it("create: crea un carrier activo por defecto y registra AuditLog", async () => {
    const result = await createCarrier(`${NAME_PREFIX}A`, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdCarrierIds.push(result.carrier.id);

    expect(result.carrier.isActive).toBe(true);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "Carrier", entityId: result.carrier.id },
    });
    expect(log?.action).toBe("CARRIER_CREATED");
    expect(log?.module).toBe("carriers");
    expect(log?.newValues).toEqual({ name: `${NAME_PREFIX}A` });
  });

  it("create: rechaza un nombre duplicado", async () => {
    const first = await createCarrier(`${NAME_PREFIX}DUP`, ctx());
    expect(first.ok).toBe(true);
    if (first.ok) createdCarrierIds.push(first.carrier.id);

    const second = await createCarrier(`${NAME_PREFIX}DUP`, ctx());
    expect(second).toEqual({ ok: false, error: "DUPLICATE_NAME" });
  });

  it("update: renombra y registra oldValues/newValues", async () => {
    const created = await createCarrier(`${NAME_PREFIX}RENAME-OLD`, ctx());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdCarrierIds.push(created.carrier.id);

    const renamed = await renameCarrier(created.carrier.id, `${NAME_PREFIX}RENAME-NEW`, ctx());
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.carrier.name).toBe(`${NAME_PREFIX}RENAME-NEW`);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "Carrier", entityId: created.carrier.id, action: "CARRIER_UPDATED" },
    });
    expect(log?.oldValues).toEqual({ name: `${NAME_PREFIX}RENAME-OLD` });
    expect(log?.newValues).toEqual({ name: `${NAME_PREFIX}RENAME-NEW` });
  });

  it("update: renombrar a un nombre ya usado por otro carrier devuelve DUPLICATE_NAME", async () => {
    const a = await createCarrier(`${NAME_PREFIX}CONFLICT-A`, ctx());
    const b = await createCarrier(`${NAME_PREFIX}CONFLICT-B`, ctx());
    if (a.ok) createdCarrierIds.push(a.carrier.id);
    if (b.ok) createdCarrierIds.push(b.carrier.id);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const result = await renameCarrier(b.carrier.id, a.carrier.name, ctx());
    expect(result).toEqual({ ok: false, error: "DUPLICATE_NAME" });
  });

  it("deactivate/activate: cambia isActive y registra el AuditLog correspondiente", async () => {
    const created = await createCarrier(`${NAME_PREFIX}TOGGLE`, ctx());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdCarrierIds.push(created.carrier.id);

    const deactivated = await setCarrierActive(created.carrier.id, false, ctx());
    expect(deactivated.ok).toBe(true);
    if (deactivated.ok) expect(deactivated.carrier.isActive).toBe(false);

    const deactivateLog = await prisma.auditLog.findFirst({
      where: { entityType: "Carrier", entityId: created.carrier.id, action: "CARRIER_DEACTIVATED" },
    });
    expect(deactivateLog?.oldValues).toEqual({ isActive: true });
    expect(deactivateLog?.newValues).toEqual({ isActive: false });

    const reactivated = await setCarrierActive(created.carrier.id, true, ctx());
    expect(reactivated.ok).toBe(true);
    if (reactivated.ok) expect(reactivated.carrier.isActive).toBe(true);

    const activateLog = await prisma.auditLog.findFirst({
      where: { entityType: "Carrier", entityId: created.carrier.id, action: "CARRIER_ACTIVATED" },
    });
    expect(activateLog).toBeTruthy();
  });

  it("un carrier inactivo NO aparece en listCarriers({ activeOnly: true })", async () => {
    const created = await createCarrier(`${NAME_PREFIX}HIDDEN`, ctx());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdCarrierIds.push(created.carrier.id);

    await setCarrierActive(created.carrier.id, false, ctx());

    const activeList = await listCarriers({ activeOnly: true });
    expect(activeList.some((carrier) => carrier.id === created.carrier.id)).toBe(false);

    const fullList = await listCarriers({ activeOnly: false });
    expect(fullList.some((carrier) => carrier.id === created.carrier.id)).toBe(true);
  });

  it("una orden histórica conserva su referencia al carrier tras desactivarlo/renombrarlo", async () => {
    const created = await createCarrier(`${NAME_PREFIX}HISTORICAL`, ctx());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdCarrierIds.push(created.carrier.id);

    const mode = await prisma.mode.findFirst({ where: { isActive: true } });
    expect(mode).toBeTruthy();
    if (!mode) return;

    const order = await prisma.vendorOrder.create({
      data: {
        orderNumber: `${ORDER_PREFIX}1`,
        status: "PENDING",
        orderDate: new Date("2026-01-01"),
        carrierId: created.carrier.id,
        modeId: mode.id,
      },
    });
    createdOrderIds.push(order.id);

    await setCarrierActive(created.carrier.id, false, ctx());
    await renameCarrier(created.carrier.id, `${NAME_PREFIX}HISTORICAL-RENAMED`, ctx());

    const persistedOrder = await prisma.vendorOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { carrier: true },
    });
    expect(persistedOrder.carrierId).toBe(created.carrier.id);
    expect(persistedOrder.carrier?.name).toBe(`${NAME_PREFIX}HISTORICAL-RENAMED`);
    expect(persistedOrder.carrier?.isActive).toBe(false);
  });

  it("rename/activate/deactivate: NOT_FOUND para un id inexistente", async () => {
    expect(await renameCarrier("does-not-exist", "X", ctx())).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await setCarrierActive("does-not-exist", false, ctx())).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});
