import { prisma } from "@/lib/prisma";
import { Prisma, type Mode } from "@/generated/prisma/client";

export interface ModeActionContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export type ModeActionResult =
  | { ok: true; mode: Mode }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_NAME" };

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createMode(name: string, context: ModeActionContext): Promise<ModeActionResult> {
  try {
    const mode = await prisma.$transaction(async (tx) => {
      const created = await tx.mode.create({ data: { name } });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "MODE_CREATED",
          module: "modes",
          entityType: "Mode",
          entityId: created.id,
          newValues: { name: created.name },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return created;
    });

    return { ok: true, mode };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_NAME" };
    }
    throw error;
  }
}

export async function renameMode(
  id: string,
  name: string,
  context: ModeActionContext,
): Promise<ModeActionResult> {
  const existing = await prisma.mode.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (existing.name === name) {
    return { ok: true, mode: existing };
  }

  try {
    const mode = await prisma.$transaction(async (tx) => {
      const updated = await tx.mode.update({ where: { id }, data: { name } });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "MODE_UPDATED",
          module: "modes",
          entityType: "Mode",
          entityId: id,
          oldValues: { name: existing.name },
          newValues: { name: updated.name },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { ok: true, mode };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_NAME" };
    }
    throw error;
  }
}

export async function setModeActive(
  id: string,
  isActive: boolean,
  context: ModeActionContext,
): Promise<ModeActionResult> {
  const existing = await prisma.mode.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (existing.isActive === isActive) {
    return { ok: true, mode: existing };
  }

  const mode = await prisma.$transaction(async (tx) => {
    const updated = await tx.mode.update({ where: { id }, data: { isActive } });

    await tx.auditLog.create({
      data: {
        userId: context.userId,
        action: isActive ? "MODE_ACTIVATED" : "MODE_DEACTIVATED",
        module: "modes",
        entityType: "Mode",
        entityId: id,
        oldValues: { isActive: existing.isActive },
        newValues: { isActive: updated.isActive },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return updated;
  });

  return { ok: true, mode };
}
