import { prisma } from "@/lib/prisma";
import { Prisma, type CosmoPeriod } from "@/generated/prisma/client";
import type { CreateCosmoPeriodInput, EditCosmoPeriodInput } from "../validation";

export interface CosmoActionContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export type CosmoPeriodActionResult =
  | { ok: true; period: CosmoPeriod }
  | { ok: false; error: "PRODUCT_NOT_FOUND" }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_PERIOD" };

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function serializePeriod(fields: { startDate: Date; endDate: Date; unitsSold: number; unitsAvailable: number }) {
  return {
    startDate: fields.startDate.toISOString(),
    endDate: fields.endDate.toISOString(),
    unitsSold: fields.unitsSold,
    unitsAvailable: fields.unitsAvailable,
  };
}

export async function createCosmoPeriod(
  input: CreateCosmoPeriodInput,
  context: CosmoActionContext,
): Promise<CosmoPeriodActionResult> {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.isActive) {
    return { ok: false, error: "PRODUCT_NOT_FOUND" };
  }

  try {
    const period = await prisma.$transaction(async (tx) => {
      const created = await tx.cosmoPeriod.create({
        data: {
          productId: input.productId,
          startDate: input.startDate,
          endDate: input.endDate,
          unitsSold: input.unitsSold,
          unitsAvailable: input.unitsAvailable,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "COSMO_PERIOD_CREATED",
          module: "marketing",
          entityType: "CosmoPeriod",
          entityId: created.id,
          newValues: { productId: input.productId, ...serializePeriod(input) },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return created;
    });

    return { ok: true, period };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_PERIOD" };
    }
    throw error;
  }
}

const PERIOD_FIELD_KEYS = ["startDate", "endDate", "unitsSold", "unitsAvailable"] as const;

export async function updateCosmoPeriod(
  id: string,
  input: EditCosmoPeriodInput,
  context: CosmoActionContext,
): Promise<CosmoPeriodActionResult> {
  const existing = await prisma.cosmoPeriod.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const oldValues: Record<string, string | number> = {};
  const newValues: Record<string, string | number> = {};
  for (const key of PERIOD_FIELD_KEYS) {
    const previousValue = existing[key];
    const nextValue = input[key];
    const changed =
      previousValue instanceof Date || nextValue instanceof Date
        ? previousValue.valueOf() !== (nextValue as Date).valueOf()
        : previousValue !== nextValue;

    if (changed) {
      oldValues[key] = previousValue instanceof Date ? previousValue.toISOString() : previousValue;
      newValues[key] = nextValue instanceof Date ? nextValue.toISOString() : nextValue;
    }
  }

  if (Object.keys(newValues).length === 0) {
    return { ok: true, period: existing };
  }

  try {
    const period = await prisma.$transaction(async (tx) => {
      const updated = await tx.cosmoPeriod.update({
        where: { id },
        data: {
          startDate: input.startDate,
          endDate: input.endDate,
          unitsSold: input.unitsSold,
          unitsAvailable: input.unitsAvailable,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "COSMO_PERIOD_UPDATED",
          module: "marketing",
          entityType: "CosmoPeriod",
          entityId: id,
          oldValues,
          newValues,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { ok: true, period };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_PERIOD" };
    }
    throw error;
  }
}
