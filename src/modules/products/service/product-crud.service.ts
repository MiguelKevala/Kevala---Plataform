import { prisma } from "@/lib/prisma";
import { Prisma, type Product } from "@/generated/prisma/client";
import type { ProductInput } from "../validation";

export interface ProductActionContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export type ProductActionResult =
  | { ok: true; product: Product }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_SKU" }
  | { ok: false; error: "DUPLICATE_ASIN" };

/** Distingue qué columna violó la restricción UNIQUE (sku vs asin) a partir
 * de `meta.target`, que según el driver puede venir como array de columnas
 * o como el nombre del índice — se cubren ambos casos. */
function uniqueConstraintViolationField(error: unknown): "sku" | "asin" | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }

  const target = error.meta?.target;
  const targetText = Array.isArray(target) ? target.join(",") : String(target ?? "");
  // `meta.target` no siempre viene poblado según el adapter/versión de
  // Postgres en uso; el nombre de la restricción (que sí identifica la
  // columna, p.ej. "products_asin_key") siempre aparece en error.message.
  const haystack = `${targetText} ${error.message}`;

  if (haystack.includes("asin")) return "asin";
  if (haystack.includes("sku")) return "sku";
  return null;
}

const PRODUCT_SCALAR_FIELD_KEYS = [
  "sku",
  "item",
  "asin",
  "caseOf",
  "casesPerPallet",
  "unitOfMeasurement",
  "unit",
  "link",
] as const satisfies readonly (keyof ProductInput)[];

/** `country` es un array: se compara por contenido (orden-independiente),
 * no por igualdad de referencia — de lo contrario cada edit generaría un
 * diff de AuditLog aunque el conjunto de países no haya cambiado. */
function sameCountrySet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

export async function createProduct(
  input: ProductInput,
  context: ProductActionContext,
): Promise<ProductActionResult> {
  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: input });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "PRODUCT_CREATED",
          module: "products",
          entityType: "Product",
          entityId: created.id,
          newValues: input,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return created;
    });

    return { ok: true, product };
  } catch (error) {
    const conflictField = uniqueConstraintViolationField(error);
    if (conflictField === "asin") {
      return { ok: false, error: "DUPLICATE_ASIN" };
    }
    if (conflictField === "sku") {
      return { ok: false, error: "DUPLICATE_SKU" };
    }
    throw error;
  }
}

export async function updateProduct(
  id: string,
  input: ProductInput,
  context: ProductActionContext,
): Promise<ProductActionResult> {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing || !existing.isActive) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const oldValues: Record<string, string | number | null | string[]> = {};
  const newValues: Record<string, string | number | null | string[]> = {};
  for (const key of PRODUCT_SCALAR_FIELD_KEYS) {
    if (existing[key] !== input[key]) {
      oldValues[key] = existing[key];
      newValues[key] = input[key];
    }
  }
  if (!sameCountrySet(existing.country, input.country)) {
    oldValues.country = existing.country;
    newValues.country = input.country;
  }

  if (Object.keys(newValues).length === 0) {
    return { ok: true, product: existing };
  }

  try {
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: input });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "PRODUCT_UPDATED",
          module: "products",
          entityType: "Product",
          entityId: id,
          oldValues,
          newValues,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { ok: true, product };
  } catch (error) {
    const conflictField = uniqueConstraintViolationField(error);
    if (conflictField === "asin") {
      return { ok: false, error: "DUPLICATE_ASIN" };
    }
    if (conflictField === "sku") {
      return { ok: false, error: "DUPLICATE_SKU" };
    }
    throw error;
  }
}

/** Soft delete: nunca se borra físicamente (ver comentario en schema.prisma)
 * para no dejar huérfanas futuras referencias desde Marketing/Cosmo -
 * Algorithm. El producto deja de listarse en el catálogo. */
export async function deleteProduct(
  id: string,
  context: ProductActionContext,
): Promise<ProductActionResult> {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing || !existing.isActive) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id }, data: { isActive: false } });

    await tx.auditLog.create({
      data: {
        userId: context.userId,
        action: "PRODUCT_DELETED",
        module: "products",
        entityType: "Product",
        entityId: id,
        oldValues: { isActive: true },
        newValues: { isActive: false },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return updated;
  });

  return { ok: true, product };
}
