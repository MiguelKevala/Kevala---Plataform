import { describe, expect, it } from "vitest";
import { productInputSchema } from "@/modules/products/validation";

const VALID_INPUT = {
  sku: "SKU001",
  item: "Product A",
  asin: "B0ABC12345",
  caseOf: 12,
  casesPerPallet: 40,
  unitOfMeasurement: "LB" as const,
  unit: 25,
};

describe("productInputSchema", () => {
  it("acepta un producto válido", () => {
    expect(productInputSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it("aplica trim a SKU e Item", () => {
    const result = productInputSchema.safeParse({
      ...VALID_INPUT,
      sku: "  SKU001  ",
      item: "  Product A  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBe("SKU001");
      expect(result.data.item).toBe("Product A");
    }
  });

  it("rechaza SKU vacío", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, sku: "" }).success).toBe(false);
  });

  it("rechaza SKU compuesto solo de espacios", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, sku: "   " }).success).toBe(false);
  });

  it("rechaza SKU con caracteres no alfanuméricos", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, sku: "SKU-001" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...VALID_INPUT, sku: "SKU 001" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...VALID_INPUT, sku: "SKU_001" }).success).toBe(false);
  });

  it("acepta SKU alfanumérico mixto", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, sku: "SKU006Sticks" }).success).toBe(true);
  });

  it("aplica trim a ASIN", () => {
    const result = productInputSchema.safeParse({ ...VALID_INPUT, asin: "  B0ABC12345  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.asin).toBe("B0ABC12345");
  });

  it("rechaza ASIN vacío", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, asin: "" }).success).toBe(false);
  });

  it("rechaza ASIN compuesto solo de espacios", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, asin: "   " }).success).toBe(false);
  });

  it("rechaza ASIN ausente del payload", () => {
    const withoutAsin: Record<string, unknown> = { ...VALID_INPUT };
    delete withoutAsin.asin;
    expect(productInputSchema.safeParse(withoutAsin).success).toBe(false);
  });

  it("rechaza ASIN con caracteres no alfanuméricos (guiones, espacios internos, símbolos)", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, asin: "B0-ABC-123" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...VALID_INPUT, asin: "B0 ABC 123" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...VALID_INPUT, asin: "B0ABC_123" }).success).toBe(false);
  });

  it("no trata el ASIN como número: acepta un valor puramente alfabético", () => {
    const result = productInputSchema.safeParse({ ...VALID_INPUT, asin: "ABCDEFGHIJ" });
    expect(result.success).toBe(true);
    if (result.success) expect(typeof result.data.asin).toBe("string");
  });

  it("acepta un ASIN puramente numérico como string, sin convertirlo", () => {
    const result = productInputSchema.safeParse({ ...VALID_INPUT, asin: "0123456789" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.asin).toBe("0123456789");
  });

  it("no normaliza mayúsculas/minúsculas del ASIN", () => {
    const result = productInputSchema.safeParse({ ...VALID_INPUT, asin: "b0abc12345" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.asin).toBe("b0abc12345");
  });

  it("rechaza Item vacío", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, item: "" }).success).toBe(false);
  });

  it("rechaza Item compuesto solo de espacios", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, item: "   " }).success).toBe(false);
  });

  it("rechaza caseOf = 0", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, caseOf: 0 }).success).toBe(false);
  });

  it("rechaza caseOf negativo", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, caseOf: -1 }).success).toBe(false);
  });

  it("rechaza caseOf decimal", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, caseOf: 1.5 }).success).toBe(false);
  });

  it("rechaza casesPerPallet = 0", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, casesPerPallet: 0 }).success).toBe(false);
  });

  it("rechaza casesPerPallet decimal", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, casesPerPallet: 2.5 }).success).toBe(false);
  });

  it("rechaza un unitOfMeasurement fuera del enum", () => {
    expect(
      productInputSchema.safeParse({ ...VALID_INPUT, unitOfMeasurement: "KG" }).success,
    ).toBe(false);
  });

  it("acepta los 6 valores exactos del enum", () => {
    for (const value of ["LB", "Gal", "Oz", "Drum", "Tote", "Sticks"]) {
      expect(
        productInputSchema.safeParse({ ...VALID_INPUT, unitOfMeasurement: value }).success,
      ).toBe(true);
    }
  });

  it("rechaza unit = 0", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, unit: 0 }).success).toBe(false);
  });

  it("rechaza unit negativo", () => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, unit: -5 }).success).toBe(false);
  });

  it("permite unit decimal (no fuerza entero)", () => {
    const result = productInputSchema.safeParse({ ...VALID_INPUT, unit: 16.5 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.unit).toBe(16.5);
  });

  it("no fuerza Drum a 1: acepta cualquier valor positivo", () => {
    expect(
      productInputSchema.safeParse({ ...VALID_INPUT, unitOfMeasurement: "Drum", unit: 3 }).success,
    ).toBe(true);
  });

  it("no fuerza Tote a 1: acepta cualquier valor positivo", () => {
    expect(
      productInputSchema.safeParse({ ...VALID_INPUT, unitOfMeasurement: "Tote", unit: 2.5 }).success,
    ).toBe(true);
  });

  it("Sticks acepta cualquier valor positivo válido (no forzado a 1)", () => {
    expect(
      productInputSchema.safeParse({ ...VALID_INPUT, unitOfMeasurement: "Sticks", unit: 30 }).success,
    ).toBe(true);
  });
});
