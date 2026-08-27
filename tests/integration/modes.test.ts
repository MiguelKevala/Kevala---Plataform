import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listModes } from "@/modules/modes/repository/mode.repository";
import { createMode, renameMode, setModeActive } from "@/modules/modes/service/mode-crud.service";
import { createCarrier } from "@/modules/carriers/service/carrier-crud.service";

const NAME_PREFIX = "TEST-MODE-";
const CARRIER_NAME_PREFIX = "TEST-MODE-HELPER-CARRIER-";
const EMAIL_PREFIX = "mode-test";
const ORDER_PREFIX = "MODETEST-";

const createdModeIds: string[] = [];
const createdOrderIds: string[] = [];

async function cleanup() {
  if (createdOrderIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "VendorOrder", entityId: { in: createdOrderIds } },
    });
  }
  await prisma.vendorOrder.deleteMany({ where: { orderNumber: { startsWith: ORDER_PREFIX } } });

  if (createdModeIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Mode", entityId: { in: createdModeIds } },
    });
  }
  await prisma.mode.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });

  const helperCarriers = await prisma.carrier.findMany({
    where: { name: { startsWith: CARRIER_NAME_PREFIX } },
    select: { id: true },
  });
  if (helperCarriers.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Carrier", entityId: { in: helperCarriers.map((c) => c.id) } },
    });
  }
  await prisma.carrier.deleteMany({ where: { name: { startsWith: CARRIER_NAME_PREFIX } } });

  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });

  createdModeIds.length = 0;
  createdOrderIds.length = 0;
}

describe("Mode CRUD (Fase 8)", () => {
  let actor: { id: string };

  beforeAll(async () => {
    await cleanup();
    actor = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}@kevala.test`, passwordHash: "not-a-real-hash", name: "Mode Test Actor" },
    });
  });

  afterAll(cleanup);

  const ctx = () => ({ userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" });

  it("create: crea un mode activo por defecto y registra AuditLog", async () => {
    const result = await createMode(`${NAME_PREFIX}A`, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdModeIds.push(result.mode.id);

    expect(result.mode.isActive).toBe(true);

    const log = await prisma.auditLog.findFirst({ where: { entityType: "Mode", entityId: result.mode.id } });
    expect(log?.action).toBe("MODE_CREATED");
    expect(log?.module).toBe("modes");
    expect(log?.newValues).toEqual({ name: `${NAME_PREFIX}A` });
  });

  it("create: rechaza un nombre duplicado", async () => {
    const first = await createMode(`${NAME_PREFIX}DUP`, ctx());
    if (first.ok) createdModeIds.push(first.mode.id);
    expect(first.ok).toBe(true);

    const second = await createMode(`${NAME_PREFIX}DUP`, ctx());
    expect(second).toEqual({ ok: false, error: "DUPLICATE_NAME" });
  });

  it("update: renombra y registra oldValues/newValues", async () => {
    const created = await createMode(`${NAME_PREFIX}RENAME-OLD`, ctx());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdModeIds.push(created.mode.id);

    const renamed = await renameMode(created.mode.id, `${NAME_PREFIX}RENAME-NEW`, ctx());
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.mode.name).toBe(`${NAME_PREFIX}RENAME-NEW`);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "Mode", entityId: created.mode.id, action: "MODE_UPDATED" },
    });
    expect(log?.oldValues).toEqual({ name: `${NAME_PREFIX}RENAME-OLD` });
    expect(log?.newValues).toEqual({ name: `${NAME_PREFIX}RENAME-NEW` });
  });

  it("deactivate/activate: cambia isActive y registra el AuditLog correspondiente", async () => {
    const created = await createMode(`${NAME_PREFIX}TOGGLE`, ctx());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdModeIds.push(created.mode.id);

    const deactivated = await setModeActive(created.mode.id, false, ctx());
    expect(deactivated.ok).toBe(true);
    if (deactivated.ok) expect(deactivated.mode.isActive).toBe(false);

    const deactivateLog = await prisma.auditLog.findFirst({
      where: { entityType: "Mode", entityId: created.mode.id, action: "MODE_DEACTIVATED" },
    });
    expect(deactivateLog?.oldValues).toEqual({ isActive: true });
    expect(deactivateLog?.newValues).toEqual({ isActive: false });

    const reactivated = await setModeActive(created.mode.id, true, ctx());
    expect(reactivated.ok).toBe(true);

    const activateLog = await prisma.auditLog.findFirst({
      where: { entityType: "Mode", entityId: created.mode.id, action: "MODE_ACTIVATED" },
    });
    expect(activateLog).toBeTruthy();
  });

  it("un mode inactivo NO aparece en listModes({ activeOnly: true })", async () => {
    const created = await createMode(`${NAME_PREFIX}HIDDEN`, ctx());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdModeIds.push(created.mode.id);

    await setModeActive(created.mode.id, false, ctx());

    const activeList = await listModes({ activeOnly: true });
    expect(activeList.some((mode) => mode.id === created.mode.id)).toBe(false);

    const fullList = await listModes({ activeOnly: false });
    expect(fullList.some((mode) => mode.id === created.mode.id)).toBe(true);
  });

  it("una orden histórica conserva su referencia al mode tras desactivarlo/renombrarlo", async () => {
    const created = await createMode(`${NAME_PREFIX}HISTORICAL`, ctx());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdModeIds.push(created.mode.id);

    const carrierResult = await createCarrier(`${CARRIER_NAME_PREFIX}1`, ctx());
    expect(carrierResult.ok).toBe(true);
    if (!carrierResult.ok) return;

    const order = await prisma.vendorOrder.create({
      data: {
        orderNumber: `${ORDER_PREFIX}1`,
        status: "PENDING",
        orderDate: new Date("2026-01-01"),
        carrierId: carrierResult.carrier.id,
        modeId: created.mode.id,
      },
    });
    createdOrderIds.push(order.id);

    await setModeActive(created.mode.id, false, ctx());
    await renameMode(created.mode.id, `${NAME_PREFIX}HISTORICAL-RENAMED`, ctx());

    const persistedOrder = await prisma.vendorOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { mode: true },
    });
    expect(persistedOrder.modeId).toBe(created.mode.id);
    expect(persistedOrder.mode?.name).toBe(`${NAME_PREFIX}HISTORICAL-RENAMED`);
    expect(persistedOrder.mode?.isActive).toBe(false);
  });

  it("rename/activate/deactivate: NOT_FOUND para un id inexistente", async () => {
    expect(await renameMode("does-not-exist", "X", ctx())).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await setModeActive("does-not-exist", false, ctx())).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
