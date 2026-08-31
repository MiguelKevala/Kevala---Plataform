import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProduct } from "@/modules/products/service/product-crud.service";
import { createCosmoPeriod } from "@/modules/marketing/service/cosmo-period-crud.service";
import {
  createCosmoChange,
  deleteCosmoChange,
  updateCosmoChange,
} from "@/modules/marketing/service/cosmo-change-crud.service";

const SKU_PREFIX = "CTEST-CHANGE";
const EMAIL_PREFIX = "cosmo-change-test";

const createdProductIds: string[] = [];
let actorUserId: string | undefined;

async function cleanup() {
  if (createdProductIds.length > 0) {
    // Escopar por entityId (no solo entityType): un delete indiscriminado
    // por entityType borraría AuditLogs de CosmoPeriod/CosmoChange ajenos a
    // este test.
    const periods = await prisma.cosmoPeriod.findMany({
      where: { productId: { in: createdProductIds } },
      select: { id: true },
    });
    const periodIds = periods.map((period) => period.id);
    if (periodIds.length > 0) {
      const changes = await prisma.cosmoChange.findMany({
        where: { cosmoPeriodId: { in: periodIds } },
        select: { id: true },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: "CosmoPeriod", entityId: { in: periodIds } },
      });
      if (changes.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { entityType: "CosmoChange", entityId: { in: changes.map((change) => change.id) } },
        });
      }
    }
    await prisma.cosmoPeriod.deleteMany({ where: { productId: { in: createdProductIds } } });
  }
  // Los CosmoChange borrados (deleteCosmoChange) ya no existen para
  // resolver su entityId al hacer cleanup — sus AuditLog de
  // COSMO_CHANGE_DELETED se escopan aparte, por userId del actor de este
  // archivo (único y descartable al final, igual que en cosmo-import.test.ts).
  if (actorUserId) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "CosmoChange", action: "COSMO_CHANGE_DELETED", userId: actorUserId },
    });
  }
  await prisma.product.deleteMany({ where: { sku: { startsWith: SKU_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  createdProductIds.length = 0;
}

describe("CosmoChange service", () => {
  let actor: { id: string };
  let productId: string;
  let periodId: string;
  let secondPeriodId: string;

  beforeAll(async () => {
    await cleanup();
    actor = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}@kevala.test`, passwordHash: "not-a-real-hash", name: "Cosmo Change Test Actor" },
    });
    actorUserId = actor.id;

    // Configurado para USA + Mexico (no Canada) a propósito: permite probar
    // combinaciones multi-mercado válidas y el rechazo de un mercado que el
    // producto NO tiene configurado (Canada).
    const product = await createProduct(
      {
        sku: `${SKU_PREFIX}001`,
        item: "Cosmo Change Test Product",
        asin: "B0COSMOCHG1",
        caseOf: 1,
        casesPerPallet: 1,
        unitOfMeasurement: "LB",
        unit: 1,
        country: ["USA", "Mexico"],
        link: null,
      },
      { userId: actor.id, ipAddress: null, userAgent: null },
    );
    if (!product.ok) throw new Error("Setup failed: could not create product");
    productId = product.product.id;
    createdProductIds.push(productId);

    const period = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-08-05T00:00:00.000Z"),
        endDate: new Date("2025-08-12T00:00:00.000Z"),
        unitsSold: 100,
        unitsAvailable: 200,
      },
      { userId: actor.id, ipAddress: null, userAgent: null },
    );
    if (!period.ok) throw new Error("Setup failed: could not create period");
    periodId = period.period.id;

    const secondPeriod = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-08-12T00:00:00.000Z"),
        endDate: new Date("2025-08-19T00:00:00.000Z"),
        unitsSold: 110,
        unitsAvailable: 190,
      },
      { userId: actor.id, ipAddress: null, userAgent: null },
    );
    if (!secondPeriod.ok) throw new Error("Setup failed: could not create second period");
    secondPeriodId = secondPeriod.period.id;
  });

  afterAll(cleanup);

  const ctx = () => ({ userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" });

  it("encuentra automáticamente el periodo correspondiente por Change Date", async () => {
    const result = await createCosmoChange(
      { productId, changeDate: new Date("2025-08-06T00:00:00.000Z"), description: "title, bullets", country: ["USA"] },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.change.cosmoPeriodId).toBe(periodId);
    }
  });

  it("un Change fuera de cualquier periodo -> NO_PERIOD, sin crear el registro", async () => {
    const result = await createCosmoChange(
      {
        productId,
        changeDate: new Date("2030-01-01T00:00:00.000Z"),
        description: "far future change",
        country: ["USA"],
      },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "NO_PERIOD" });

    const count = await prisma.cosmoChange.count({
      where: { description: "far future change" },
    });
    expect(count).toBe(0);
  });

  it("no crea automáticamente un periodo cuando no existe uno para la fecha", async () => {
    const before = await prisma.cosmoPeriod.count({ where: { productId } });
    await createCosmoChange(
      {
        productId,
        changeDate: new Date("2030-01-01T00:00:00.000Z"),
        description: "should not create a period",
        country: ["USA"],
      },
      ctx(),
    );
    const after = await prisma.cosmoPeriod.count({ where: { productId } });
    expect(after).toBe(before);
  });

  it("permite múltiples Changes en el mismo periodo", async () => {
    await createCosmoChange(
      {
        productId,
        changeDate: new Date("2025-08-07T00:00:00.000Z"),
        description: "second change in period 1",
        country: ["USA"],
      },
      ctx(),
    );
    await createCosmoChange(
      {
        productId,
        changeDate: new Date("2025-08-08T00:00:00.000Z"),
        description: "third change in period 1",
        country: ["USA"],
      },
      ctx(),
    );

    const count = await prisma.cosmoChange.count({ where: { cosmoPeriodId: periodId } });
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("permite múltiples Changes en la misma fecha (no usa changeDate como unique)", async () => {
    const first = await createCosmoChange(
      { productId, changeDate: new Date("2025-08-09T00:00:00.000Z"), description: "title changed", country: ["USA"] },
      ctx(),
    );
    const second = await createCosmoChange(
      { productId, changeDate: new Date("2025-08-09T00:00:00.000Z"), description: "bullets changed", country: ["USA"] },
      ctx(),
    );
    const third = await createCosmoChange(
      { productId, changeDate: new Date("2025-08-09T00:00:00.000Z"), description: "images changed", country: ["USA"] },
      ctx(),
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(true);

    const count = await prisma.cosmoChange.count({
      where: { cosmoPeriodId: periodId, changeDate: new Date("2025-08-09T00:00:00.000Z") },
    });
    expect(count).toBe(3);
  });

  it("rechaza un producto inexistente con PRODUCT_NOT_FOUND", async () => {
    const result = await createCosmoChange(
      { productId: "does-not-exist", changeDate: new Date("2025-08-06T00:00:00.000Z"), description: "x", country: ["USA"] },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "PRODUCT_NOT_FOUND" });
  });

  it("crea un AuditLog COSMO_CHANGE_CREATED", async () => {
    const result = await createCosmoChange(
      {
        productId,
        changeDate: new Date("2025-08-10T00:00:00.000Z"),
        description: "audit test change",
        country: ["USA"],
      },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "CosmoChange", entityId: result.change.id, action: "COSMO_CHANGE_CREATED" },
    });
    expect(log).toBeTruthy();
    expect(log?.module).toBe("marketing");
  });

  it("edita un Change (fecha y descripción) y re-resuelve el periodo si la fecha se mueve a otro periodo", async () => {
    const created = await createCosmoChange(
      { productId, changeDate: new Date("2025-08-11T00:00:00.000Z"), description: "before edit", country: ["USA"] },
      ctx(),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.change.cosmoPeriodId).toBe(periodId);

    const result = await updateCosmoChange(
      created.change.id,
      { changeDate: new Date("2025-08-14T00:00:00.000Z"), description: "after edit", country: ["USA"] },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.change.cosmoPeriodId).toBe(secondPeriodId);
      expect(result.change.description).toBe("after edit");
    }

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "CosmoChange", entityId: created.change.id, action: "COSMO_CHANGE_UPDATED" },
    });
    expect(log).toBeTruthy();
  });

  it("editar un Change a una fecha sin periodo -> NO_PERIOD, sin persistir el cambio", async () => {
    const created = await createCosmoChange(
      { productId, changeDate: new Date("2025-08-06T00:00:00.000Z"), description: "will not move", country: ["USA"] },
      ctx(),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await updateCosmoChange(
      created.change.id,
      { changeDate: new Date("2030-01-01T00:00:00.000Z"), description: "moved", country: ["USA"] },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "NO_PERIOD" });

    const persisted = await prisma.cosmoChange.findUniqueOrThrow({ where: { id: created.change.id } });
    expect(persisted.description).toBe("will not move");
  });

  it("devuelve NOT_FOUND al editar un change inexistente", async () => {
    const result = await updateCosmoChange(
      "does-not-exist",
      { changeDate: new Date("2025-08-06T00:00:00.000Z"), description: "x", country: ["USA"] },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  describe("Markets (country)", () => {
    it("crea un Change con un solo mercado", async () => {
      const result = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-19T00:00:00.000Z"),
          description: "Title and bullets changed",
          country: ["USA"],
        },
        ctx(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.change.country).toEqual(["USA"]);
    });

    it("crea un Change con combinación de varios mercados", async () => {
      const result = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-19T00:00:00.000Z"),
          description: "A+ modified",
          country: ["USA", "Mexico"],
        },
        ctx(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.change.country.sort()).toEqual(["Mexico", "USA"]);
    });

    it("misma fecha/periodo, distintas combinaciones de mercado por Change (§ejemplo del usuario)", async () => {
      const titleChange = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-05T00:00:00.000Z"),
          description: "Title and bullets changed",
          country: ["USA"],
        },
        ctx(),
      );
      const aplusChange = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-05T00:00:00.000Z"),
          description: "A+ modified",
          country: ["USA", "Mexico"],
        },
        ctx(),
      );

      expect(titleChange.ok).toBe(true);
      expect(aplusChange.ok).toBe(true);

      const changes = await prisma.cosmoChange.findMany({
        where: { cosmoPeriodId: periodId, changeDate: new Date("2025-08-05T00:00:00.000Z") },
      });
      expect(changes).toHaveLength(2);
    });

    it("rechaza un mercado que el producto NO tiene configurado en Catalog (Canada)", async () => {
      const result = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-06T00:00:00.000Z"),
          description: "Listing images changed",
          country: ["Canada"],
        },
        ctx(),
      );
      expect(result).toEqual({ ok: false, error: "INVALID_MARKET" });

      const count = await prisma.cosmoChange.count({
        where: { description: "Listing images changed" },
      });
      expect(count).toBe(0);
    });

    it("rechaza si CUALQUIERA de los mercados seleccionados no está configurado, aunque los demás sí", async () => {
      const result = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-06T00:00:00.000Z"),
          description: "mixed valid and invalid market",
          country: ["USA", "Canada"],
        },
        ctx(),
      );
      expect(result).toEqual({ ok: false, error: "INVALID_MARKET" });
    });

    it("edita los mercados de un Change existente y lo registra en AuditLog", async () => {
      const created = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-06T00:00:00.000Z"),
          description: "market edit test",
          country: ["USA"],
        },
        ctx(),
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await updateCosmoChange(
        created.change.id,
        { changeDate: new Date("2025-08-06T00:00:00.000Z"), description: "market edit test", country: ["USA", "Mexico"] },
        ctx(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.change.country.sort()).toEqual(["Mexico", "USA"]);

      const log = await prisma.auditLog.findFirst({
        where: { entityType: "CosmoChange", entityId: created.change.id, action: "COSMO_CHANGE_UPDATED" },
        orderBy: { createdAt: "desc" },
      });
      expect(log).toBeTruthy();
      expect((log?.oldValues as Record<string, unknown>)?.country).toEqual(["USA"]);
    });

    it("rechaza editar un Change a un mercado no configurado para el producto", async () => {
      const created = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-06T00:00:00.000Z"),
          description: "market edit invalid test",
          country: ["USA"],
        },
        ctx(),
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await updateCosmoChange(
        created.change.id,
        { changeDate: new Date("2025-08-06T00:00:00.000Z"), description: "market edit invalid test", country: ["Canada"] },
        ctx(),
      );
      expect(result).toEqual({ ok: false, error: "INVALID_MARKET" });

      const persisted = await prisma.cosmoChange.findUniqueOrThrow({ where: { id: created.change.id } });
      expect(persisted.country).toEqual(["USA"]);
    });
  });

  describe("deleteCosmoChange", () => {
    it("elimina un Change existente (borrado real, no soft-delete)", async () => {
      const created = await createCosmoChange(
        { productId, changeDate: new Date("2025-08-12T00:00:00.000Z"), description: "to be deleted", country: ["USA"] },
        ctx(),
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await deleteCosmoChange(created.change.id, ctx());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.change.id).toBe(created.change.id);

      const persisted = await prisma.cosmoChange.findUnique({ where: { id: created.change.id } });
      expect(persisted).toBeNull();
    });

    it("no afecta otros Changes del mismo periodo", async () => {
      const survivor = await createCosmoChange(
        { productId, changeDate: new Date("2025-08-12T00:00:00.000Z"), description: "survives deletion", country: ["USA"] },
        ctx(),
      );
      const toDelete = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-12T00:00:00.000Z"),
          description: "gets deleted next to survivor",
          country: ["Mexico"],
        },
        ctx(),
      );
      expect(survivor.ok).toBe(true);
      expect(toDelete.ok).toBe(true);
      if (!survivor.ok || !toDelete.ok) return;

      await deleteCosmoChange(toDelete.change.id, ctx());

      const stillThere = await prisma.cosmoChange.findUnique({ where: { id: survivor.change.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere?.description).toBe("survives deletion");
    });

    it("devuelve NOT_FOUND al eliminar un Change inexistente", async () => {
      const result = await deleteCosmoChange("does-not-exist", ctx());
      expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    });

    it("devuelve NOT_FOUND al intentar eliminar el mismo Change dos veces", async () => {
      const created = await createCosmoChange(
        { productId, changeDate: new Date("2025-08-12T00:00:00.000Z"), description: "double delete test", country: ["USA"] },
        ctx(),
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const first = await deleteCosmoChange(created.change.id, ctx());
      expect(first.ok).toBe(true);

      const second = await deleteCosmoChange(created.change.id, ctx());
      expect(second).toEqual({ ok: false, error: "NOT_FOUND" });
    });

    it("crea un AuditLog COSMO_CHANGE_DELETED con los datos del Change eliminado", async () => {
      const created = await createCosmoChange(
        {
          productId,
          changeDate: new Date("2025-08-12T00:00:00.000Z"),
          description: "audit delete test",
          country: ["USA", "Mexico"],
        },
        ctx(),
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      await deleteCosmoChange(created.change.id, ctx());

      const log = await prisma.auditLog.findFirst({
        where: { entityType: "CosmoChange", entityId: created.change.id, action: "COSMO_CHANGE_DELETED" },
      });
      expect(log).toBeTruthy();
      expect(log?.module).toBe("marketing");
      expect(log?.newValues).toBeNull();
      const oldValues = log?.oldValues as Record<string, unknown>;
      expect(oldValues.description).toBe("audit delete test");
      expect(oldValues.country).toEqual(["USA", "Mexico"]);
    });
  });
});
