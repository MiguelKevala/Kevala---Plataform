import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { sortCountries } from "../validation";
import { parseCosmoWorkbook } from "./cosmo-excel-parser";
import { readWorkbookAsMatrix } from "./cosmo-excel-reader";
import type { CosmoActionContext } from "../service/cosmo-period-crud.service";

export interface CosmoImportSummary {
  productsProcessed: number;
  periodsImported: number;
  periodsUpdated: number;
  changesImported: number;
  productsNotFound: string[];
  invalidPeriods: Array<{ product: string; raw: string; error: string }>;
  invalidChanges: Array<{ product: string; line: string; reason: string }>;
  duplicateChangesSkipped: number;
  errors: Array<{ product: string; error: string }>;
}

/**
 * Orquesta la importación completa: lee el archivo, lo parsea (puro, sin
 * DB), resuelve todos los ASIN contra el catálogo en UNA consulta (evita
 * N+1 — §42), y persiste cada bloque de producto en su PROPIA transacción
 * (§41: un error en un producto nunca debe invalidar silenciosamente los
 * demás). Nunca crea productos — un ASIN no encontrado se reporta y se
 * omite (§4/§26). Es segura ante reimportación: los periodos se
 * crean-o-actualizan por (productId, startDate, endDate); los changes se
 * apoyan en su UNIQUE (cosmoPeriodId, changeDate, description) para nunca
 * duplicarse (§25).
 */
export async function importCosmoExcel(
  buffer: Buffer,
  context: CosmoActionContext,
): Promise<CosmoImportSummary> {
  const matrix = await readWorkbookAsMatrix(buffer);
  const blocks = parseCosmoWorkbook(matrix);

  const summary: CosmoImportSummary = {
    productsProcessed: 0,
    periodsImported: 0,
    periodsUpdated: 0,
    changesImported: 0,
    productsNotFound: [],
    invalidPeriods: [],
    invalidChanges: [],
    duplicateChangesSkipped: 0,
    errors: [],
  };

  const asins = [...new Set(blocks.map((block) => block.asin.trim()).filter((asin) => asin !== ""))];
  const products = asins.length > 0
    ? await prisma.product.findMany({ where: { asin: { in: asins }, isActive: true } })
    : [];
  const productByAsin = new Map(products.map((product) => [product.asin, product]));

  for (const block of blocks) {
    const asin = block.asin.trim();
    const productLabel = asin || block.productName || `Row ${block.rowIndex + 1}`;

    if (!asin) {
      summary.errors.push({ product: productLabel, error: "Missing ASIN for this product block." });
      continue;
    }

    const product = productByAsin.get(asin);
    if (!product) {
      summary.productsNotFound.push(asin);
      continue;
    }

    if (block.blockErrors.length > 0) {
      for (const error of block.blockErrors) {
        summary.errors.push({ product: asin, error });
      }
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (const entry of block.periods) {
          if (!entry.period.ok) {
            summary.invalidPeriods.push({ product: asin, raw: entry.raw.period, error: entry.period.error });
            continue;
          }
          if (!entry.unitsSold.ok) {
            summary.invalidPeriods.push({
              product: asin,
              raw: entry.raw.unitsSold,
              error: `Units Sold: ${entry.unitsSold.error}`,
            });
            continue;
          }
          if (!entry.unitsAvailable.ok) {
            summary.invalidPeriods.push({
              product: asin,
              raw: entry.raw.unitsAvailable,
              error: `Units Available: ${entry.unitsAvailable.error}`,
            });
            continue;
          }

          const { startDate, endDate } = entry.period.value;
          const existingPeriod = await tx.cosmoPeriod.findUnique({
            where: { productId_startDate_endDate: { productId: product.id, startDate, endDate } },
          });

          let periodId: string;
          if (existingPeriod) {
            periodId = existingPeriod.id;
            if (
              existingPeriod.unitsSold !== entry.unitsSold.value ||
              existingPeriod.unitsAvailable !== entry.unitsAvailable.value
            ) {
              await tx.cosmoPeriod.update({
                where: { id: existingPeriod.id },
                data: { unitsSold: entry.unitsSold.value, unitsAvailable: entry.unitsAvailable.value },
              });
              summary.periodsUpdated += 1;
            }
          } else {
            const created = await tx.cosmoPeriod.create({
              data: {
                productId: product.id,
                startDate,
                endDate,
                unitsSold: entry.unitsSold.value,
                unitsAvailable: entry.unitsAvailable.value,
              },
            });
            periodId = created.id;
            summary.periodsImported += 1;
          }

          for (const warning of entry.changeWarnings) {
            summary.invalidChanges.push({ product: asin, line: warning.line, reason: warning.reason });
          }

          // Un Change solo puede aplicar a mercados que el producto tiene
          // configurados en Catalog — nunca a uno fuera de ese conjunto
          // (mismo principio que ASIN no encontrado: se reporta y se omite
          // esa línea puntual, sin bloquear el resto del bloque).
          const validChanges = entry.changes.filter((change) => {
            const invalidMarket = change.country.find((market) => !product.country.includes(market));
            if (invalidMarket) {
              summary.invalidChanges.push({
                product: asin,
                line: `${change.changeDate.toISOString().slice(0, 10)} - ${change.country.join(", ")} - ${change.description}`,
                reason: `Market "${invalidMarket}" is not configured for this product in Catalog.`,
              });
              return false;
            }
            return true;
          });

          if (validChanges.length > 0) {
            // IMPORTANTE: no usar create() + try/catch por línea dentro de
            // esta misma transacción. Postgres aborta la transacción ENTERA
            // ante cualquier error de sentencia (incluido un P2002), así que
            // atrapar la excepción en JS no "revive" la transacción — las
            // sentencias siguientes fallarían igual con 25P02. createMany +
            // skipDuplicates resuelve la idempotencia a nivel SQL (ON
            // CONFLICT DO NOTHING), sin lanzar ninguna excepción.
            const result = await tx.cosmoChange.createMany({
              data: validChanges.map((change) => ({
                cosmoPeriodId: periodId,
                changeDate: change.changeDate,
                description: change.description,
                country: sortCountries(change.country),
              })),
              skipDuplicates: true,
            });
            summary.changesImported += result.count;
            summary.duplicateChangesSkipped += validChanges.length - result.count;
          }
        }
      });

      summary.productsProcessed += 1;
    } catch (error) {
      summary.errors.push({
        product: asin,
        error: error instanceof Error ? error.message : "Unknown error while importing this product.",
      });
    }
  }

  // Un único registro de auditoría por corrida de importación (no uno por
  // periodo/change importado) — evita miles de filas de AuditLog en un
  // archivo grande, respetando la guía de performance (§42), sin dejar de
  // auditar el evento en sí (quién importó, cuándo, con qué resultado).
  await prisma.auditLog.create({
    data: {
      userId: context.userId,
      action: "COSMO_IMPORT_COMPLETED",
      module: "marketing",
      entityType: "CosmoImport",
      entityId: randomUUID(),
      newValues: summary as unknown as Prisma.InputJsonValue,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  return summary;
}
