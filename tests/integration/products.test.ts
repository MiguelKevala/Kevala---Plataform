import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listProducts } from "@/modules/products/repository/product.repository";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/modules/products/service/product-crud.service";
import type { ProductInput } from "@/modules/products/validation";

const SKU_PREFIX = "PTEST";
const EMAIL_PREFIX = "products-test";

const createdProductIds: string[] = [];

async function cleanup() {
  if (createdProductIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Product", entityId: { in: createdProductIds } },
    });
  }
  await prisma.product.deleteMany({ where: { sku: { startsWith: SKU_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  createdProductIds.length = 0;
}

describe("Products module", () => {
  let actor: { id: string };

  beforeAll(async () => {
    await cleanup();
    actor = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}@kevala.test`, passwordHash: "not-a-real-hash", name: "Products Test Actor" },
    });
  });

  afterAll(cleanup);

  const ctx = () => ({ userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" });

  function baseInput(sku: string, overrides: Partial<ProductInput> = {}): ProductInput {
    return {
      sku,
      item: "Test Product",
      caseOf: 12,
      casesPerPallet: 40,
      unitOfMeasurement: "LB",
      unit: 25,
      ...overrides,
    };
  }

  describe("createProduct", () => {
    it("crea un producto con los datos capturados", async () => {
      const result = await createProduct(baseInput(`${SKU_PREFIX}001`), ctx());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      createdProductIds.push(result.product.id);

      expect(result.product.sku).toBe(`${SKU_PREFIX}001`);
      expect(result.product.item).toBe("Test Product");
      expect(result.product.caseOf).toBe(12);
      expect(result.product.casesPerPallet).toBe(40);
      expect(result.product.unitOfMeasurement).toBe("LB");
      expect(result.product.unit).toBe(25);
      expect(result.product.isActive).toBe(true);
    });

    it("permite unit decimal", async () => {
      const result = await createProduct(
        baseInput(`${SKU_PREFIX}002`, { unitOfMeasurement: "Oz", unit: 16.5 }),
        ctx(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        createdProductIds.push(result.product.id);
        expect(result.product.unit).toBe(16.5);
      }
    });

    it("no fuerza Drum/Tote/Sticks a 1: acepta cualquier valor positivo", async () => {
      const drum = await createProduct(
        baseInput(`${SKU_PREFIX}003`, { unitOfMeasurement: "Drum", unit: 3 }),
        ctx(),
      );
      const tote = await createProduct(
        baseInput(`${SKU_PREFIX}004`, { unitOfMeasurement: "Tote", unit: 2 }),
        ctx(),
      );
      const sticks = await createProduct(
        baseInput(`${SKU_PREFIX}005`, { unitOfMeasurement: "Sticks", unit: 30 }),
        ctx(),
      );

      expect(drum.ok).toBe(true);
      expect(tote.ok).toBe(true);
      expect(sticks.ok).toBe(true);
      if (drum.ok) {
        createdProductIds.push(drum.product.id);
        expect(drum.product.unit).toBe(3);
      }
      if (tote.ok) {
        createdProductIds.push(tote.product.id);
        expect(tote.product.unit).toBe(2);
      }
      if (sticks.ok) {
        createdProductIds.push(sticks.product.id);
        expect(sticks.product.unit).toBe(30);
      }
    });

    it("rechaza un SKU duplicado con DUPLICATE_SKU, sin dejar restos", async () => {
      const first = await createProduct(baseInput(`${SKU_PREFIX}DUP`), ctx());
      expect(first.ok).toBe(true);
      if (first.ok) createdProductIds.push(first.product.id);

      const second = await createProduct(baseInput(`${SKU_PREFIX}DUP`), ctx());
      expect(second).toEqual({ ok: false, error: "DUPLICATE_SKU" });

      const count = await prisma.product.count({ where: { sku: `${SKU_PREFIX}DUP` } });
      expect(count).toBe(1);
    });

    it("crea un AuditLog PRODUCT_CREATED", async () => {
      const result = await createProduct(baseInput(`${SKU_PREFIX}006`), ctx());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      createdProductIds.push(result.product.id);

      const log = await prisma.auditLog.findFirst({
        where: { entityType: "Product", entityId: result.product.id, action: "PRODUCT_CREATED" },
      });
      expect(log).toBeTruthy();
      expect(log?.module).toBe("products");
      expect(log?.oldValues).toBeNull();
      expect((log?.newValues as Record<string, unknown>)?.sku).toBe(`${SKU_PREFIX}006`);
    });
  });

  describe("updateProduct", () => {
    it("edita los campos del producto", async () => {
      const created = await createProduct(baseInput(`${SKU_PREFIX}007`), ctx());
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      createdProductIds.push(created.product.id);

      const result = await updateProduct(
        created.product.id,
        baseInput(`${SKU_PREFIX}007`, { item: "Renamed Product", unit: 50 }),
        ctx(),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.product.item).toBe("Renamed Product");
        expect(result.product.unit).toBe(50);
      }
    });

    it("permite cambiar el SKU manteniendo unicidad", async () => {
      const created = await createProduct(baseInput(`${SKU_PREFIX}008`), ctx());
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      createdProductIds.push(created.product.id);

      const result = await updateProduct(
        created.product.id,
        baseInput(`${SKU_PREFIX}008NEW`),
        ctx(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.product.sku).toBe(`${SKU_PREFIX}008NEW`);
    });

    it("rechaza cambiar el SKU a uno usado por otro producto (DUPLICATE_SKU)", async () => {
      const productA = await createProduct(baseInput(`${SKU_PREFIX}009A`), ctx());
      const productB = await createProduct(baseInput(`${SKU_PREFIX}009B`), ctx());
      expect(productA.ok).toBe(true);
      expect(productB.ok).toBe(true);
      if (!productA.ok || !productB.ok) return;
      createdProductIds.push(productA.product.id, productB.product.id);

      const result = await updateProduct(
        productB.product.id,
        baseInput(`${SKU_PREFIX}009A`),
        ctx(),
      );
      expect(result).toEqual({ ok: false, error: "DUPLICATE_SKU" });

      const persisted = await prisma.product.findUniqueOrThrow({ where: { id: productB.product.id } });
      expect(persisted.sku).toBe(`${SKU_PREFIX}009B`);
    });

    it("devuelve NOT_FOUND para un producto inexistente", async () => {
      const result = await updateProduct("does-not-exist", baseInput(`${SKU_PREFIX}010`), ctx());
      expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    });

    it("sin cambios reales: no crea AuditLog", async () => {
      const created = await createProduct(baseInput(`${SKU_PREFIX}011`), ctx());
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      createdProductIds.push(created.product.id);

      const beforeCount = await prisma.auditLog.count({
        where: { entityType: "Product", entityId: created.product.id },
      });

      const result = await updateProduct(created.product.id, baseInput(`${SKU_PREFIX}011`), ctx());
      expect(result.ok).toBe(true);

      const afterCount = await prisma.auditLog.count({
        where: { entityType: "Product", entityId: created.product.id },
      });
      expect(afterCount).toBe(beforeCount);
    });
  });

  describe("deleteProduct (soft delete)", () => {
    it("desactiva el producto y ya no aparece en listProducts", async () => {
      const created = await createProduct(baseInput(`${SKU_PREFIX}012`), ctx());
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      createdProductIds.push(created.product.id);

      const result = await deleteProduct(created.product.id, ctx());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.product.isActive).toBe(false);

      const persisted = await prisma.product.findUniqueOrThrow({ where: { id: created.product.id } });
      expect(persisted).toBeTruthy();
      expect(persisted.isActive).toBe(false);

      const { items } = await listProducts({ search: `${SKU_PREFIX}012`, page: 1, pageSize: 20 });
      expect(items).toHaveLength(0);
    });

    it("devuelve NOT_FOUND para un producto inexistente", async () => {
      const result = await deleteProduct("does-not-exist", ctx());
      expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    });

    it("devuelve NOT_FOUND si ya está desactivado (no se puede eliminar dos veces)", async () => {
      const created = await createProduct(baseInput(`${SKU_PREFIX}013`), ctx());
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      createdProductIds.push(created.product.id);

      await deleteProduct(created.product.id, ctx());
      const second = await deleteProduct(created.product.id, ctx());
      expect(second).toEqual({ ok: false, error: "NOT_FOUND" });
    });
  });

  describe("listProducts (search + pagination)", () => {
    beforeAll(async () => {
      const seedProducts = [
        baseInput(`${SKU_PREFIX}S01`, { item: "Electrolytes Mix" }),
        baseInput(`${SKU_PREFIX}S02`, { item: "Protein Bar" }),
        baseInput(`${SKU_PREFIX}S03`, { item: "Electrolytes Powder" }),
      ];
      for (const input of seedProducts) {
        const result = await createProduct(input, ctx());
        if (result.ok) createdProductIds.push(result.product.id);
      }
    });

    it("busca por SKU (case-insensitive)", async () => {
      const { items, total } = await listProducts({ search: `${SKU_PREFIX.toLowerCase()}s01`, page: 1, pageSize: 20 });
      expect(total).toBe(1);
      expect(items[0].sku).toBe(`${SKU_PREFIX}S01`);
    });

    it("busca por Item (case-insensitive, coincidencia parcial)", async () => {
      const { items, total } = await listProducts({ search: "electrolytes", page: 1, pageSize: 20 });
      expect(total).toBe(2);
      expect(items.map((item) => item.sku).sort()).toEqual([`${SKU_PREFIX}S01`, `${SKU_PREFIX}S03`].sort());
    });

    it("pagina correctamente", async () => {
      const { items, total } = await listProducts({ search: SKU_PREFIX, page: 1, pageSize: 2 });
      expect(total).toBeGreaterThanOrEqual(3);
      expect(items).toHaveLength(2);
    });

    it("ordena por SKU ascendente", async () => {
      const { items } = await listProducts({ search: `${SKU_PREFIX}S0`, page: 1, pageSize: 20 });
      const skus = items.map((item) => item.sku);
      expect(skus).toEqual([...skus].sort());
    });
  });
});
