import { prisma } from "@/lib/prisma";
import type { Prisma, VendorOrder, VendorOrderStatus } from "@/generated/prisma/client";

export interface VendorOrderActionContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RejectVendorOrderContext extends VendorOrderActionContext {
  reason: string;
  comments?: string | null;
}

export type VendorOrderActionResult =
  | { ok: true; order: VendorOrder }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "CONFLICT"; currentStatus: VendorOrderStatus };

class VendorOrderTransitionConflictError extends Error {}

const TIMESTAMP_FIELD_BY_STATUS = {
  CONFIRMED: "confirmedAt",
  REJECTED: "rejectedAt",
  DELIVERED: "deliveredAt",
} as const satisfies Partial<Record<VendorOrderStatus, keyof Prisma.VendorOrderUpdateManyMutationInput>>;

interface RunTransitionParams {
  orderId: string;
  from: VendorOrderStatus;
  to: keyof typeof TIMESTAMP_FIELD_BY_STATUS;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  auditAction: string;
  reason?: string | null;
  comments?: string | null;
}

/**
 * Ejecuta una transición de estado de VendorOrder de forma atómica.
 *
 * El guard real contra condiciones de carrera es el `updateMany` con
 * `where: { id, status: from }` dentro de la transacción: si otra request ya
 * cambió el estado, `count` será 0 y la transacción se revierte sin dejar
 * historial ni audit log huérfanos.
 */
async function runVendorOrderTransition(params: RunTransitionParams): Promise<VendorOrderActionResult> {
  const { orderId, from, to, userId, ipAddress, userAgent, auditAction, reason, comments } = params;

  const existing = await prisma.vendorOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });

  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const now = new Date();
  const timestampField = TIMESTAMP_FIELD_BY_STATUS[to];
  const data: Prisma.VendorOrderUpdateManyMutationInput = { status: to, [timestampField]: now };

  try {
    const order = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.vendorOrder.updateMany({
        where: { id: orderId, status: from },
        data,
      });

      if (updateResult.count === 0) {
        throw new VendorOrderTransitionConflictError();
      }

      await tx.vendorOrderStatusHistory.create({
        data: {
          vendorOrderId: orderId,
          previousStatus: from,
          newStatus: to,
          changedBy: userId,
          reason: reason ?? null,
          comments: comments ?? null,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: auditAction,
          module: "vendor",
          entityType: "VendorOrder",
          entityId: orderId,
          oldValues: { status: from },
          newValues: { status: to },
          ipAddress,
          userAgent,
          createdAt: now,
        },
      });

      return tx.vendorOrder.findUniqueOrThrow({ where: { id: orderId } });
    });

    return { ok: true, order };
  } catch (error) {
    if (error instanceof VendorOrderTransitionConflictError) {
      const current = await prisma.vendorOrder.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      return { ok: false, error: "CONFLICT", currentStatus: current?.status ?? from };
    }
    throw error;
  }
}

export async function confirmVendorOrder(
  orderId: string,
  context: VendorOrderActionContext,
): Promise<VendorOrderActionResult> {
  return runVendorOrderTransition({
    orderId,
    from: "PENDING",
    to: "CONFIRMED",
    userId: context.userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    auditAction: "VENDOR_ORDER_CONFIRMED",
  });
}

export async function rejectVendorOrder(
  orderId: string,
  context: RejectVendorOrderContext,
): Promise<VendorOrderActionResult> {
  return runVendorOrderTransition({
    orderId,
    from: "PENDING",
    to: "REJECTED",
    userId: context.userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    auditAction: "VENDOR_ORDER_REJECTED",
    reason: context.reason,
    comments: context.comments ?? null,
  });
}

export async function deliverVendorOrder(
  orderId: string,
  context: VendorOrderActionContext,
): Promise<VendorOrderActionResult> {
  return runVendorOrderTransition({
    orderId,
    from: "CONFIRMED",
    to: "DELIVERED",
    userId: context.userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    auditAction: "VENDOR_ORDER_DELIVERED",
  });
}
