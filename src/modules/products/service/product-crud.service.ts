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
  | { ok: false; error: "DUPLICATE_SKU" };

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const PRODUCT_FIELD_KEYS = [
  "sku",
  "item",
  "caseOf",
  "casesPerPallet",
  "unitOfMeasurement",
  "unit",
] as const satisfies readonly (keyof ProductInput)[];

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
    if (isUniqueConstraintViolation(error)) {
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

  const oldValues: Record<string, string | number> = {};
  const newValues: Record<string, string | number> = {};
  for (const key of PRODUCT_FIELD_KEYS) {
    if (existing[key] !== input[key]) {
      oldValues[key] = existing[key];
      newValues[key] = input[key];
    }
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
    if (isUniqueConstraintViolation(error)) {
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
