import { prisma } from "@/lib/prisma";
import { Prisma, type VendorOrder } from "@/generated/prisma/client";

export interface VendorOrderActorContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface VendorOrderOperationalFields {
  orderDate: Date;
  confirmationDeadline: Date | null;
  deliveryDeadline: Date | null;
  carrierId: string;
  modeId: string;
  invoiceNumber: number | null;
  cartonLabels: boolean;
  bol: boolean;
  palletLabels: boolean;
  upsLabels: boolean;
  ontracLabels: boolean;
  amzx: boolean;
  asn: boolean;
}

export interface CreateVendorOrderInput extends VendorOrderOperationalFields {
  orderNumber: string;
}

type CatalogError =
  | { ok: false; error: "CARRIER_NOT_FOUND" }
  | { ok: false; error: "INACTIVE_CARRIER" }
  | { ok: false; error: "MODE_NOT_FOUND" }
  | { ok: false; error: "INACTIVE_MODE" };

export type CreateVendorOrderResult =
  | { ok: true; order: VendorOrder }
  | { ok: false; error: "DUPLICATE_ORDER_NUMBER" }
  | CatalogError;

export type EditVendorOrderResult =
  | { ok: true; order: VendorOrder }
  | { ok: false; error: "NOT_FOUND" }
  | CatalogError;

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Valida que carrier/mode existan y estén activos. Si `previousId` coincide
 * con el id entrante, no se exige que esté activo (permite dejar intacta una
 * referencia que ya estaba activa al elegirla y luego se desactivó).
 */
async function validateCatalogSelection(
  carrierId: string,
  modeId: string,
  previous?: { carrierId: string | null; modeId: string | null },
): Promise<CatalogError | null> {
  const [carrier, mode] = await Promise.all([
    prisma.carrier.findUnique({ where: { id: carrierId } }),
    prisma.mode.findUnique({ where: { id: modeId } }),
  ]);

  if (!carrier) return { ok: false, error: "CARRIER_NOT_FOUND" };
  if (!carrier.isActive && carrierId !== previous?.carrierId) {
    return { ok: false, error: "INACTIVE_CARRIER" };
  }

  if (!mode) return { ok: false, error: "MODE_NOT_FOUND" };
  if (!mode.isActive && modeId !== previous?.modeId) {
    return { ok: false, error: "INACTIVE_MODE" };
  }

  return null;
}

function buildOperationalData(fields: VendorOrderOperationalFields) {
  return {
    orderDate: fields.orderDate,
    confirmationDeadline: fields.confirmationDeadline,
    deliveryDeadline: fields.deliveryDeadline,
    carrierId: fields.carrierId,
    modeId: fields.modeId,
    invoiceNumber: fields.invoiceNumber,
    cartonLabels: fields.cartonLabels,
    bol: fields.bol,
    palletLabels: fields.palletLabels,
    upsLabels: fields.upsLabels,
    ontracLabels: fields.ontracLabels,
    amzx: fields.amzx,
    asn: fields.asn,
  };
}

export async function createVendorOrder(
  input: CreateVendorOrderInput,
  context: VendorOrderActorContext,
): Promise<CreateVendorOrderResult> {
  const catalogError = await validateCatalogSelection(input.carrierId, input.modeId);
  if (catalogError) return catalogError;

  const now = new Date();
  const data = buildOperationalData(input);

  try {
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.vendorOrder.create({
        data: {
          orderNumber: input.orderNumber,
          status: "PENDING",
          ...data,
        },
      });

      await tx.vendorOrderStatusHistory.create({
        data: {
          vendorOrderId: created.id,
          previousStatus: null,
          newStatus: "PENDING",
          changedBy: context.userId,
          reason: null,
          comments: null,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: context.userId,
          action: "VENDOR_ORDER_CREATED",
          module: "vendor",
          entityType: "VendorOrder",
          entityId: created.id,
          newValues: {
            orderNumber: created.orderNumber,
            status: created.status,
            ...data,
            orderDate: data.orderDate.toISOString(),
            confirmationDeadline: data.confirmationDeadline?.toISOString() ?? null,
            deliveryDeadline: data.deliveryDeadline?.toISOString() ?? null,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          createdAt: now,
        },
      });

      return created;
    });

    return { ok: true, order };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "DUPLICATE_ORDER_NUMBER" };
    }
    throw error;
  }
}

const OPERATIONAL_FIELD_KEYS = [
  "orderDate",
  "confirmationDeadline",
  "deliveryDeadline",
  "carrierId",
  "modeId",
  "invoiceNumber",
  "cartonLabels",
  "bol",
  "palletLabels",
  "upsLabels",
  "ontracLabels",
  "amzx",
  "asn",
] as const satisfies readonly (keyof VendorOrderOperationalFields)[];

type AuditScalar = string | number | boolean | null;

function serializeForAudit(value: string | number | boolean | Date | null): AuditScalar {
  return value instanceof Date ? value.toISOString() : value;
}

export async function editVendorOrder(
  orderId: string,
  input: VendorOrderOperationalFields,
  context: VendorOrderActorContext,
): Promise<EditVendorOrderResult> {
  const existing = await prisma.vendorOrder.findUnique({ where: { id: orderId } });
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const catalogError = await validateCatalogSelection(input.carrierId, input.modeId, {
    carrierId: existing.carrierId,
    modeId: existing.modeId,
  });
  if (catalogError) return catalogError;

  const nextData = buildOperationalData(input);

  const oldValues: Record<string, AuditScalar> = {};
  const newValues: Record<string, AuditScalar> = {};

  for (const key of OPERATIONAL_FIELD_KEYS) {
    const previousValue = existing[key];
    const nextValue = nextData[key];
    const changed =
      previousValue instanceof Date || nextValue instanceof Date
        ? previousValue?.valueOf() !== (nextValue as Date | null)?.valueOf()
        : previousValue !== nextValue;

    if (changed) {
      oldValues[key] = serializeForAudit(previousValue);
      newValues[key] = serializeForAudit(nextValue);
    }
  }

  if (Object.keys(newValues).length === 0) {
    return { ok: true, order: existing };
  }

  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.vendorOrder.update({ where: { id: orderId }, data: nextData });

    await tx.auditLog.create({
      data: {
        userId: context.userId,
        action: "VENDOR_ORDER_UPDATED",
        module: "vendor",
        entityType: "VendorOrder",
        entityId: orderId,
        oldValues: oldValues as Prisma.InputJsonValue,
        newValues: newValues as Prisma.InputJsonValue,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return updated;
  });

  return { ok: true, order };
}
