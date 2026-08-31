import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProduct } from "@/modules/products/service/product-crud.service";
import { importCosmoExcel } from "@/modules/marketing/importer/cosmo-import.service";

const SKU_PREFIX = "CTEST-IMPORT";
const EMAIL_PREFIX = "cosmo-import-test";

interface FixtureProductBlock {
  productName: string;
  asin: string;
  link: string;
  country: string;
  periods: Array<{ period: string; unitsSold: string; change: string; unitsAvailable: string }>;
}

/** Construye un archivo .xlsx real en memoria replicando el layout
 * documentado (§2): etiquetas de producto en columna A/valor en B; grilla
 * de periodos con etiqueta en columna B y valores empezando en columna C. */
async function buildWorkbookBuffer(products: FixtureProductBlock[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cosmo");

  let row = 1;
  for (const product of products) {
    sheet.getCell(row, 1).value = "Product name";
    sheet.getCell(row, 2).value = product.productName;
    row++;
    sheet.getCell(row, 1).value = "ASIN";
    sheet.getCell(row, 2).value = product.asin;
    row++;
    sheet.getCell(row, 1).value = "LINK";
    sheet.getCell(row, 2).value = product.link;
    row++;
    sheet.getCell(row, 1).value = "Country";
    sheet.getCell(row, 2).value = product.country;
    row++;
    row++; // fila vacía (A6 en el ejemplo)

    const periodRow = row;
    sheet.getCell(periodRow, 2).value = "Period";
    product.periods.forEach((entry, index) => {
      sheet.getCell(periodRow, 3 + index).value = entry.period;
    });
    row++;

    const unitsSoldRow = row;
    sheet.getCell(unitsSoldRow, 2).value = "Units sold";
    product.periods.forEach((entry, index) => {
      sheet.getCell(unitsSoldRow, 3 + index).value = entry.unitsSold;
    });
    row++;

    const changeRow = row;
    sheet.getCell(changeRow, 2).value = "Change";
    product.periods.forEach((entry, index) => {
      sheet.getCell(changeRow, 3 + index).value = entry.change;
    });
    row++;

    const unitsAvailableRow = row;
    sheet.getCell(unitsAvailableRow, 2).value = "Unit available";
    product.periods.forEach((entry, index) => {
      sheet.getCell(unitsAvailableRow, 3 + index).value = entry.unitsAvailable;
    });
    row++;

    row += 2; // filas vacías antes del siguiente bloque (A11:A12 en el ejemplo)
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as unknown as ArrayBuffer);
}

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
  // CosmoImport: el entityId es un UUID sintético sin relación a ningún
  // producto, así que se escopa de forma segura por userId — el actor de
  // prueba de este archivo, único y descartable al final.
  if (actorUserId) {
    await prisma.auditLog.deleteMany({ where: { entityType: "CosmoImport", userId: actorUserId } });
  }
  await prisma.product.deleteMany({ where: { sku: { startsWith: SKU_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  createdProductIds.length = 0;
}

describe("Cosmo Excel importer", () => {
  let actor: { id: string };
  let productAId: string;
  let productBId: string;

  beforeAll(async () => {
    await cleanup();
    actor = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}@kevala.test`, passwordHash: "not-a-real-hash", name: "Cosmo Import Test Actor" },
    });
    actorUserId = actor.id;

    const productA = await createProduct(
      {
        sku: `${SKU_PREFIX}A`,
        item: "Import Test Product A",
        asin: "B0IMPORTAA1",
        caseOf: 1,
        casesPerPallet: 1,
        unitOfMeasurement: "LB",
        unit: 1,
        country: ["USA"],
        link: null,
      },
      { userId: actor.id, ipAddress: null, userAgent: null },
    );
    if (!productA.ok) throw new Error("Setup failed: could not create product A");
    productAId = productA.product.id;
    createdProductIds.push(productAId);

    const productB = await createProduct(
      {
        sku: `${SKU_PREFIX}B`,
        item: "Import Test Product B",
        asin: "B0IMPORTBB2",
        caseOf: 1,
        casesPerPallet: 1,
        unitOfMeasurement: "LB",
        unit: 1,
        country: ["USA", "Mexico"],
        link: null,
      },
      { userId: actor.id, ipAddress: null, userAgent: null },
    );
    if (!productB.ok) throw new Error("Setup failed: could not create product B");
    productBId = productB.product.id;
    createdProductIds.push(productBId);
  });

  afterAll(cleanup);

  const ctx = () => ({ userId: actor.id, ipAddress: "127.0.0.1", userAgent: "vitest" });

  it("importa un único producto: periodos y changes correctos", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "https://amazon.com/dp/B0IMPORTAA1",
        country: "USA",
        periods: [
          {
            period: "08/05/25 - 08/12/25",
            unitsSold: "125",
            change: "08/06/25 - USA - title, bullets",
            unitsAvailable: "340",
          },
        ],
      },
    ]);

    const summary = await importCosmoExcel(buffer, ctx());

    expect(summary.productsProcessed).toBe(1);
    expect(summary.periodsImported).toBe(1);
    expect(summary.changesImported).toBe(1);
    expect(summary.productsNotFound).toEqual([]);
    expect(summary.errors).toEqual([]);

    const period = await prisma.cosmoPeriod.findFirst({
      where: { productId: productAId, startDate: new Date("2025-08-05T00:00:00.000Z") },
      include: { changes: true },
    });
    expect(period).toBeTruthy();
    expect(period?.unitsSold).toBe(125);
    expect(period?.unitsAvailable).toBe(340);
    expect(period?.changes).toHaveLength(1);
    expect(period?.changes[0].description).toBe("title, bullets");
    expect(period?.changes[0].country).toEqual(["USA"]);
  });

  it("importa múltiples productos en el mismo archivo", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "",
        country: "USA",
        periods: [
          { period: "09/01/25 - 09/08/25", unitsSold: "10", change: "", unitsAvailable: "20" },
        ],
      },
      {
        productName: "Import Test Product B",
        asin: "B0IMPORTBB2",
        link: "",
        country: "USA",
        periods: [
          { period: "09/01/25 - 09/08/25", unitsSold: "30", change: "", unitsAvailable: "40" },
        ],
      },
    ]);

    const summary = await importCosmoExcel(buffer, ctx());

    expect(summary.productsProcessed).toBe(2);
    expect(summary.periodsImported).toBe(2);

    const periodA = await prisma.cosmoPeriod.findFirst({
      where: { productId: productAId, startDate: new Date("2025-09-01T00:00:00.000Z") },
    });
    const periodB = await prisma.cosmoPeriod.findFirst({
      where: { productId: productBId, startDate: new Date("2025-09-01T00:00:00.000Z") },
    });
    expect(periodA?.unitsSold).toBe(10);
    expect(periodB?.unitsSold).toBe(30);
  });

  it("reporta un ASIN inexistente en productsNotFound, sin crear un producto ni fallar el resto del archivo", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        productName: "Ghost Product",
        asin: "B0DOESNOTEXIST",
        link: "",
        country: "USA",
        periods: [{ period: "10/01/25 - 10/08/25", unitsSold: "5", change: "", unitsAvailable: "5" }],
      },
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "",
        country: "USA",
        periods: [{ period: "10/01/25 - 10/08/25", unitsSold: "7", change: "", unitsAvailable: "8" }],
      },
    ]);

    const summary = await importCosmoExcel(buffer, ctx());

    expect(summary.productsNotFound).toContain("B0DOESNOTEXIST");
    expect(summary.productsProcessed).toBe(1);

    const ghostCount = await prisma.product.count({ where: { asin: "B0DOESNOTEXIST" } });
    expect(ghostCount).toBe(0);

    const periodA = await prisma.cosmoPeriod.findFirst({
      where: { productId: productAId, startDate: new Date("2025-10-01T00:00:00.000Z") },
    });
    expect(periodA?.unitsSold).toBe(7);
  });

  it("reporta un periodo con formato inválido sin bloquear el resto del bloque", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "",
        country: "USA",
        periods: [
          { period: "not a period", unitsSold: "1", change: "", unitsAvailable: "1" },
          { period: "11/01/25 - 11/08/25", unitsSold: "12", change: "", unitsAvailable: "13" },
        ],
      },
    ]);

    const summary = await importCosmoExcel(buffer, ctx());

    expect(summary.invalidPeriods.length).toBeGreaterThan(0);
    expect(summary.productsProcessed).toBe(1);

    const validPeriod = await prisma.cosmoPeriod.findFirst({
      where: { productId: productAId, startDate: new Date("2025-11-01T00:00:00.000Z") },
    });
    expect(validPeriod?.unitsSold).toBe(12);
  });

  it("reporta un Change con un mercado no configurado para el producto, sin bloquear el periodo ni el resto del bloque", async () => {
    // Product A está configurado solo para USA (ver beforeAll) — un Change
    // que referencie Mexico debe reportarse como inválido y no persistirse,
    // sin impedir que el periodo (y sus otros changes válidos) se importen.
    const buffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "",
        country: "USA",
        periods: [
          {
            period: "01/01/27 - 01/08/27",
            unitsSold: "20",
            change: "01/02/27 - USA - valid market change\n01/03/27 - Mexico - unconfigured market change",
            unitsAvailable: "25",
          },
        ],
      },
    ]);

    const summary = await importCosmoExcel(buffer, ctx());

    expect(summary.periodsImported).toBe(1);
    expect(summary.changesImported).toBe(1);
    expect(summary.invalidChanges).toHaveLength(1);
    expect(summary.invalidChanges[0].reason).toContain("Mexico");
    expect(summary.errors).toEqual([]);

    const period = await prisma.cosmoPeriod.findFirst({
      where: { productId: productAId, startDate: new Date("2027-01-01T00:00:00.000Z") },
      include: { changes: true },
    });
    expect(period?.changes).toHaveLength(1);
    expect(period?.changes[0].description).toBe("valid market change");
  });

  it("importa un Change con combinación de varios mercados", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product B",
        asin: "B0IMPORTBB2",
        link: "",
        country: "USA",
        periods: [
          {
            period: "02/01/27 - 02/08/27",
            unitsSold: "8",
            change: "02/02/27 - USA, Mexico - A+ modified",
            unitsAvailable: "9",
          },
        ],
      },
    ]);

    const summary = await importCosmoExcel(buffer, ctx());
    expect(summary.changesImported).toBe(1);

    const period = await prisma.cosmoPeriod.findFirst({
      where: { productId: productBId, startDate: new Date("2027-02-01T00:00:00.000Z") },
      include: { changes: true },
    });
    expect(period?.changes[0].country.sort()).toEqual(["Mexico", "USA"]);
  });

  it("es seguro ante una segunda importación del mismo archivo: no duplica periodos ni changes, incluyendo múltiples changes en el mismo periodo", async () => {
    // Regresión: un periodo con 2+ changes ejercita createMany+skipDuplicates
    // dentro de la misma transacción — un P2002 individual (try/catch por
    // create()) aborta toda la transacción de Postgres y arruina el resto
    // del bloque, así que este caso debe cubrirse explícitamente.
    const buffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "",
        country: "USA",
        periods: [
          {
            period: "12/01/25 - 12/08/25",
            unitsSold: "50",
            change: "12/02/25 - USA - first import\n12/03/25 - USA - second import",
            unitsAvailable: "60",
          },
        ],
      },
    ]);

    const first = await importCosmoExcel(buffer, ctx());
    expect(first.periodsImported).toBe(1);
    expect(first.changesImported).toBe(2);
    expect(first.errors).toEqual([]);

    const second = await importCosmoExcel(buffer, ctx());
    expect(second.periodsImported).toBe(0);
    expect(second.periodsUpdated).toBe(0);
    expect(second.changesImported).toBe(0);
    expect(second.duplicateChangesSkipped).toBe(2);
    expect(second.errors).toEqual([]);

    const periodCount = await prisma.cosmoPeriod.count({
      where: { productId: productAId, startDate: new Date("2025-12-01T00:00:00.000Z") },
    });
    expect(periodCount).toBe(1);

    const changeCount = await prisma.cosmoChange.count({
      where: { description: { in: ["first import", "second import"] } },
    });
    expect(changeCount).toBe(2);
  });

  it("actualiza Units Sold/Available si el mismo periodo se reimporta con valores distintos", async () => {
    const firstBuffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "",
        country: "USA",
        periods: [{ period: "01/05/26 - 01/12/26", unitsSold: "100", change: "", unitsAvailable: "200" }],
      },
    ]);
    await importCosmoExcel(firstBuffer, ctx());

    const secondBuffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "",
        country: "USA",
        periods: [{ period: "01/05/26 - 01/12/26", unitsSold: "150", change: "", unitsAvailable: "250" }],
      },
    ]);
    const secondSummary = await importCosmoExcel(secondBuffer, ctx());

    expect(secondSummary.periodsImported).toBe(0);
    expect(secondSummary.periodsUpdated).toBe(1);

    const period = await prisma.cosmoPeriod.findFirst({
      where: { productId: productAId, startDate: new Date("2026-01-05T00:00:00.000Z") },
    });
    expect(period?.unitsSold).toBe(150);
    expect(period?.unitsAvailable).toBe(250);
  });

  it("crea un único AuditLog COSMO_IMPORT_COMPLETED por corrida de importación", async () => {
    const buffer = await buildWorkbookBuffer([
      {
        productName: "Import Test Product A",
        asin: "B0IMPORTAA1",
        link: "",
        country: "USA",
        periods: [{ period: "02/01/26 - 02/08/26", unitsSold: "1", change: "", unitsAvailable: "1" }],
      },
    ]);

    const beforeCount = await prisma.auditLog.count({ where: { action: "COSMO_IMPORT_COMPLETED" } });
    await importCosmoExcel(buffer, ctx());
    const afterCount = await prisma.auditLog.count({ where: { action: "COSMO_IMPORT_COMPLETED" } });

    expect(afterCount).toBe(beforeCount + 1);

    const log = await prisma.auditLog.findFirst({
      where: { action: "COSMO_IMPORT_COMPLETED" },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.module).toBe("marketing");
    expect(log?.userId).toBe(actor.id);
  });
});
