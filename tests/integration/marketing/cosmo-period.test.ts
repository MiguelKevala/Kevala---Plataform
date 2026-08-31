import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProduct } from "@/modules/products/service/product-crud.service";
import {
  createCosmoPeriod,
  updateCosmoPeriod,
} from "@/modules/marketing/service/cosmo-period-crud.service";

const SKU_PREFIX = "CTEST-PERIOD";
const EMAIL_PREFIX = "cosmo-period-test";

const createdProductIds: string[] = [];

async function cleanup() {
  if (createdProductIds.length > 0) {
    // Escopar por entityId (no solo entityType): un delete indiscriminado
    // por entityType borraría AuditLogs de CosmoPeriod ajenos a este test.
    const periods = await prisma.cosmoPeriod.findMany({
      where: { productId: { in: createdProductIds } },
      select: { id: true },
    });
    if (periods.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityType: "CosmoPeriod", entityId: { in: periods.map((period) => period.id) } },
      });
    }
    await prisma.cosmoPeriod.deleteMany({ where: { productId: { in: createdProductIds } } });
  }
  await prisma.product.deleteMany({ where: { sku: { startsWith: SKU_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  createdProductIds.length = 0;
}

describe("CosmoPeriod service", () => {
  let actor: { id: string };
  let productId: string;

  beforeAll(async () => {
    await cleanup();
    actor = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}@kevala.test`, passwordHash: "not-a-real-hash", name: "Cosmo Period Test Actor" },
    });

    const product = await createProduct(
      {
        sku: `${SKU_PREFIX}001`,
        item: "Cosmo Test Product",
        asin: "B0COSMOPRD1",
        caseOf: 1,
        casesPerPallet: 1,
        unitOfMeasurement: "LB",
        unit: 1,
        country: ["USA"],
        link: null,
      },
      { userId: actor.id, ipAddress: null, userAgent: null },
    );
    if (product.ok) {
      productId = product.product.id;
      createdProductIds.push(productId);
    }
  });

  afterAll(cleanup);

  const ctx = () => ({ userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" });

  it("crea un CosmoPeriod con Start Date/End Date exactas (sin Week Number)", async () => {
    const result = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-08-05T00:00:00.000Z"),
        endDate: new Date("2025-08-12T00:00:00.000Z"),
        unitsSold: 125,
        unitsAvailable: 340,
      },
      ctx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.period.startDate.toISOString()).toBe("2025-08-05T00:00:00.000Z");
      expect(result.period.endDate.toISOString()).toBe("2025-08-12T00:00:00.000Z");
      expect(result.period.unitsSold).toBe(125);
      expect(result.period.unitsAvailable).toBe(340);
      expect(Object.keys(result.period)).not.toContain("weekNumber");
    }
  });

  it("crea múltiples periodos para el mismo producto", async () => {
    const first = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-08-12T00:00:00.000Z"),
        endDate: new Date("2025-08-19T00:00:00.000Z"),
        unitsSold: 140,
        unitsAvailable: 300,
      },
      ctx(),
    );
    const second = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-08-19T00:00:00.000Z"),
        endDate: new Date("2025-08-26T00:00:00.000Z"),
        unitsSold: 155,
        unitsAvailable: 260,
      },
      ctx(),
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const count = await prisma.cosmoPeriod.count({ where: { productId } });
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("no permite un periodo duplicado (mismo producto + Start Date + End Date)", async () => {
    const first = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-09-01T00:00:00.000Z"),
        endDate: new Date("2025-09-08T00:00:00.000Z"),
        unitsSold: 10,
        unitsAvailable: 20,
      },
      ctx(),
    );
    expect(first.ok).toBe(true);

    const duplicate = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-09-01T00:00:00.000Z"),
        endDate: new Date("2025-09-08T00:00:00.000Z"),
        unitsSold: 999,
        unitsAvailable: 999,
      },
      ctx(),
    );
    expect(duplicate).toEqual({ ok: false, error: "DUPLICATE_PERIOD" });

    const count = await prisma.cosmoPeriod.count({
      where: { productId, startDate: new Date("2025-09-01T00:00:00.000Z") },
    });
    expect(count).toBe(1);
  });

  it("rechaza un producto inexistente con PRODUCT_NOT_FOUND", async () => {
    const result = await createCosmoPeriod(
      {
        productId: "does-not-exist",
        startDate: new Date("2025-10-01T00:00:00.000Z"),
        endDate: new Date("2025-10-08T00:00:00.000Z"),
        unitsSold: 1,
        unitsAvailable: 1,
      },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "PRODUCT_NOT_FOUND" });
  });

  it("crea un AuditLog COSMO_PERIOD_CREATED", async () => {
    const result = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-11-01T00:00:00.000Z"),
        endDate: new Date("2025-11-08T00:00:00.000Z"),
        unitsSold: 50,
        unitsAvailable: 100,
      },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "CosmoPeriod", entityId: result.period.id, action: "COSMO_PERIOD_CREATED" },
    });
    expect(log).toBeTruthy();
    expect(log?.module).toBe("marketing");
  });

  it("edita Units Sold / Units Available y registra AuditLog COSMO_PERIOD_UPDATED", async () => {
    const created = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2025-12-01T00:00:00.000Z"),
        endDate: new Date("2025-12-08T00:00:00.000Z"),
        unitsSold: 10,
        unitsAvailable: 20,
      },
      ctx(),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await updateCosmoPeriod(
      created.period.id,
      {
        startDate: created.period.startDate,
        endDate: created.period.endDate,
        unitsSold: 99,
        unitsAvailable: 199,
      },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.period.unitsSold).toBe(99);
      expect(result.period.unitsAvailable).toBe(199);
    }

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "CosmoPeriod", entityId: created.period.id, action: "COSMO_PERIOD_UPDATED" },
    });
    expect(log).toBeTruthy();
    expect(log?.oldValues).toEqual({ unitsSold: 10, unitsAvailable: 20 });
    expect(log?.newValues).toEqual({ unitsSold: 99, unitsAvailable: 199 });
  });

  it("devuelve NOT_FOUND al editar un periodo inexistente", async () => {
    const result = await updateCosmoPeriod(
      "does-not-exist",
      {
        startDate: new Date("2025-12-01T00:00:00.000Z"),
        endDate: new Date("2025-12-08T00:00:00.000Z"),
        unitsSold: 1,
        unitsAvailable: 1,
      },
      ctx(),
    );
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("sin cambios reales: no crea AuditLog", async () => {
    const created = await createCosmoPeriod(
      {
        productId,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-01-08T00:00:00.000Z"),
        unitsSold: 5,
        unitsAvailable: 5,
      },
      ctx(),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const beforeCount = await prisma.auditLog.count({
      where: { entityType: "CosmoPeriod", entityId: created.period.id },
    });

    const result = await updateCosmoPeriod(
      created.period.id,
      {
        startDate: created.period.startDate,
        endDate: created.period.endDate,
        unitsSold: 5,
        unitsAvailable: 5,
      },
      ctx(),
    );
    expect(result.ok).toBe(true);

    const afterCount = await prisma.auditLog.count({
      where: { entityType: "CosmoPeriod", entityId: created.period.id },
    });
    expect(afterCount).toBe(beforeCount);
  });
});
