import { prisma } from "@/lib/prisma";
import { Prisma, type CosmoChange } from "@/generated/prisma/client";
import type { CountryValue } from "@/modules/products/validation";
import { findPeriodContainingDate } from "../repository/cosmo-period.repository";
import type { CreateCosmoChangeInput, EditCosmoChangeInput } from "../validation";
import type { CosmoActionContext } from "./cosmo-period-crud.service";

export type CosmoChangeActionResult =
  | { ok: true; change: CosmoChange }
  | { ok: false; error: "PRODUCT_NOT_FOUND" }
  | { ok: false; error: "NO_PERIOD" }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_MARKET" }
  | { ok: false; error: "DUPLICATE_CHANGE" };

export type DeleteCosmoChangeResult =
  | { ok: true; change: CosmoChange }
  | { ok: false; error: "NOT_FOUND" };

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Un Change solo puede aplicar a mercados que el producto ya tiene
 * configurados en Catalog — nunca a uno fuera de ese conjunto. */
function isMarketSubset(selected: readonly CountryValue[], allowed: readonly string[]): boolean {
  return selected.every((market) => allowed.includes(market));
}

/** El usuario nunca elige el periodo: se resuelve automáticamente a partir
 * de productId + changeDate (changeDate >= startDate AND changeDate <=
 * endDate). Si no existe un periodo que contenga esa fecha, NO se crea uno
 * automáticamente — se rechaza con NO_PERIOD (decisión de negocio §10/§30). */
export async function createCosmoChange(
  input: CreateCosmoChangeInput,
  context: CosmoActionContext,
): Promise<CosmoChangeActionResult> {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.isActive) {
    return { ok: false, error: "PRODUCT_NOT_FOUND" };
  }

  if (!isMarketSubset(input.country, product.country)) {
    return { ok: false, error: "INVALID_MARKET" };
  }

  const period = await findPeriodContainingDate(input.productId, input.changeDate);
  if (!period) {
    return { ok: false, error: "NO_PERIOD" };
  }

  try {
    const change = await prisma.$transaction(async (tx) => {
      const created = await tx.cosmoChange.create({
        data: {
          cosmoPeriodId: period.id,
          changeDate: input.changeDate,
          description: input.description,
          country: input.country,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "COSMO_CHANGE_CREATED",
          module: "marketing",
          entityType: "CosmoChange",
          entityId: created.id,
          newValues: {
            cosmoPeriodId: period.id,
            changeDate: input.changeDate.toISOString(),
            description: input.description,
            country: input.country,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return created;
    });

    return { ok: true, change };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_CHANGE" };
    }
    throw error;
  }
}

/** Borrado real (no soft-delete): a diferencia de Product/Carrier/Mode, un
 * CosmoChange no es un registro maestro referenciado por nada más — es una
 * entrada de captura manual, y "eliminar" aquí significa corregir un error
 * de captura, no desactivar un dato de catálogo. Usa los mismos permisos de
 * administración de Cosmo (marketing.cosmo.manage) que create/update. */
export async function deleteCosmoChange(
  id: string,
  context: CosmoActionContext,
): Promise<DeleteCosmoChangeResult> {
  const existing = await prisma.cosmoChange.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const change = await prisma.$transaction(async (tx) => {
    const deleted = await tx.cosmoChange.delete({ where: { id } });

    await tx.auditLog.create({
      data: {
        userId: context.userId,
        action: "COSMO_CHANGE_DELETED",
        module: "marketing",
        entityType: "CosmoChange",
        entityId: id,
        oldValues: {
          cosmoPeriodId: existing.cosmoPeriodId,
          changeDate: existing.changeDate.toISOString(),
          description: existing.description,
          country: existing.country,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return deleted;
  });

  return { ok: true, change };
}

export async function updateCosmoChange(
  id: string,
  input: EditCosmoChangeInput,
  context: CosmoActionContext,
): Promise<CosmoChangeActionResult> {
  const existing = await prisma.cosmoChange.findUnique({
    where: { id },
    include: { cosmoPeriod: { include: { product: true } } },
  });
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (!isMarketSubset(input.country, existing.cosmoPeriod.product.country)) {
    return { ok: false, error: "INVALID_MARKET" };
  }

  // El Change Date puede moverse a otra fecha: se re-resuelve el periodo
  // correspondiente al producto dueño del periodo actual (nunca cambia de
  // producto desde aquí). Si la nueva fecha no cae en ningún periodo de ese
  // mismo producto, se rechaza — igual que en creación.
  const period = await findPeriodContainingDate(existing.cosmoPeriod.productId, input.changeDate);
  if (!period) {
    return { ok: false, error: "NO_PERIOD" };
  }

  const oldValues: Record<string, string | string[]> = {};
  const newValues: Record<string, string | string[]> = {};

  if (existing.cosmoPeriodId !== period.id) {
    oldValues.cosmoPeriodId = existing.cosmoPeriodId;
    newValues.cosmoPeriodId = period.id;
  }
  if (existing.changeDate.getTime() !== input.changeDate.getTime()) {
    oldValues.changeDate = existing.changeDate.toISOString();
    newValues.changeDate = input.changeDate.toISOString();
  }
  if (existing.description !== input.description) {
    oldValues.description = existing.description;
    newValues.description = input.description;
  }
  if (
    existing.country.length !== input.country.length ||
    existing.country.some((market, index) => market !== input.country[index])
  ) {
    oldValues.country = existing.country;
    newValues.country = input.country;
  }

  if (Object.keys(newValues).length === 0) {
    return { ok: true, change: existing };
  }

  try {
    const change = await prisma.$transaction(async (tx) => {
      const updated = await tx.cosmoChange.update({
        where: { id },
        data: {
          cosmoPeriodId: period.id,
          changeDate: input.changeDate,
          description: input.description,
          country: input.country,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "COSMO_CHANGE_UPDATED",
          module: "marketing",
          entityType: "CosmoChange",
          entityId: id,
          oldValues,
          newValues,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { ok: true, change };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_CHANGE" };
    }
    throw error;
  }
}
