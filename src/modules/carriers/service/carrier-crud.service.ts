import { prisma } from "@/lib/prisma";
import { Prisma, type Carrier } from "@/generated/prisma/client";

export interface CarrierActionContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export type CarrierActionResult =
  | { ok: true; carrier: Carrier }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_NAME" };

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createCarrier(
  name: string,
  context: CarrierActionContext,
): Promise<CarrierActionResult> {
  try {
    const carrier = await prisma.$transaction(async (tx) => {
      const created = await tx.carrier.create({ data: { name } });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "CARRIER_CREATED",
          module: "carriers",
          entityType: "Carrier",
          entityId: created.id,
          newValues: { name: created.name },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return created;
    });

    return { ok: true, carrier };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_NAME" };
    }
    throw error;
  }
}

export async function renameCarrier(
  id: string,
  name: string,
  context: CarrierActionContext,
): Promise<CarrierActionResult> {
  const existing = await prisma.carrier.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (existing.name === name) {
    return { ok: true, carrier: existing };
  }

  try {
    const carrier = await prisma.$transaction(async (tx) => {
      const updated = await tx.carrier.update({ where: { id }, data: { name } });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "CARRIER_UPDATED",
          module: "carriers",
          entityType: "Carrier",
          entityId: id,
          oldValues: { name: existing.name },
          newValues: { name: updated.name },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { ok: true, carrier };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_NAME" };
    }
    throw error;
  }
}

export async function setCarrierActive(
  id: string,
  isActive: boolean,
  context: CarrierActionContext,
): Promise<CarrierActionResult> {
  const existing = await prisma.carrier.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (existing.isActive === isActive) {
    return { ok: true, carrier: existing };
  }

  const carrier = await prisma.$transaction(async (tx) => {
    const updated = await tx.carrier.update({ where: { id }, data: { isActive } });

    await tx.auditLog.create({
      data: {
        userId: context.userId,
        action: isActive ? "CARRIER_ACTIVATED" : "CARRIER_DEACTIVATED",
        module: "carriers",
        entityType: "Carrier",
        entityId: id,
        oldValues: { isActive: existing.isActive },
        newValues: { isActive: updated.isActive },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return updated;
  });

  return { ok: true, carrier };
}
