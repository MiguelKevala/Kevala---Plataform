import { prisma } from "@/lib/prisma";
import { Prisma, type VendorOrder } from "@/generated/prisma/client";
import { validateShippingChecklistConsistency } from "../domain/shipping-checklist";
import { computeConfirmationDeadline, computeDeliveryDeadline } from "../domain/vendor-order-deadlines";

export interface VendorOrderActorContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface VendorOrderOperationalFields {
  orderDate: Date;
  carrierId: string | null;
  modeId: string | null;
  tracking: string | null;
  deliveryDate: Date | null;
  pickUpDate: Date | null;
  shipmentDate: Date | null;
  invoiceNumber: number | null;
  cartonLabels: boolean | null;
  bol: boolean | null;
  palletLabels: boolean | null;
  asn: boolean | null;
  carrierLabels: boolean | null;
  carrierLabelType: string | null;
  packingSlip: boolean | null;
}

export interface CreateVendorOrderInput extends VendorOrderOperationalFields {
  orderNumber: string;
}

type CatalogError =
  | { ok: false; error: "CARRIER_NOT_FOUND" }
  | { ok: false; error: "INACTIVE_CARRIER" }
  | { ok: false; error: "MODE_NOT_FOUND" }
  | { ok: false; error: "INACTIVE_MODE" };

type ChecklistError = { ok: false; error: "CHECKLIST_INVALID"; issues: string[] };

export type CreateVendorOrderResult =
  | { ok: true; order: VendorOrder }
  | { ok: false; error: "DUPLICATE_ORDER_NUMBER" }
  | CatalogError
  | ChecklistError;

export type EditVendorOrderResult =
  | { ok: true; order: VendorOrder }
  | { ok: false; error: "NOT_FOUND" }
  | CatalogError
  | ChecklistError;

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Carrier y Mode son opcionales (Amazon puede asignarlos después): si el id
 * entrante es null, no hay nada que validar. Si viene presente, debe existir
 * y estar activo — salvo que coincida con `previousId` (permite dejar
 * intacta una referencia que ya estaba activa al elegirla y luego se
 * desactivó).
 */
async function validateCatalogSelection(
  carrierId: string | null,
  modeId: string | null,
  previous?: { carrierId: string | null; modeId: string | null },
): Promise<CatalogError | null> {
  if (carrierId) {
    const carrier = await prisma.carrier.findUnique({ where: { id: carrierId } });
    if (!carrier) return { ok: false, error: "CARRIER_NOT_FOUND" };
    if (!carrier.isActive && carrierId !== previous?.carrierId) {
      return { ok: false, error: "INACTIVE_CARRIER" };
    }
  }

  if (modeId) {
    const mode = await prisma.mode.findUnique({ where: { id: modeId } });
    if (!mode) return { ok: false, error: "MODE_NOT_FOUND" };
    if (!mode.isActive && modeId !== previous?.modeId) {
      return { ok: false, error: "INACTIVE_MODE" };
    }
  }

  return null;
}

/**
 * Confirmation Deadline y Delivery Deadline nunca llegan como input del
 * usuario: el backend es la única autoridad que las calcula, siempre a
 * partir de orderDate (única fuente de verdad en vendor-order-deadlines.ts).
 * Así se garantiza que un cliente nunca pueda enviar un valor manual.
 */
function buildOperationalData(fields: VendorOrderOperationalFields) {
  return {
    orderDate: fields.orderDate,
    confirmationDeadline: computeConfirmationDeadline(fields.orderDate),
    deliveryDeadline: computeDeliveryDeadline(fields.orderDate),
    carrierId: fields.carrierId,
    modeId: fields.modeId,
    tracking: fields.tracking,
    deliveryDate: fields.deliveryDate,
    pickUpDate: fields.pickUpDate,
    shipmentDate: fields.shipmentDate,
    invoiceNumber: fields.invoiceNumber,
    cartonLabels: fields.cartonLabels,
    bol: fields.bol,
    palletLabels: fields.palletLabels,
    asn: fields.asn,
    carrierLabels: fields.carrierLabels,
    carrierLabelType: fields.carrierLabelType,
    packingSlip: fields.packingSlip,
  };
}

export async function createVendorOrder(
  input: CreateVendorOrderInput,
  context: VendorOrderActorContext,
): Promise<CreateVendorOrderResult> {
  const checklistIssues = validateShippingChecklistConsistency(input);
  if (checklistIssues.length > 0) {
    return { ok: false, error: "CHECKLIST_INVALID", issues: checklistIssues };
  }

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
            confirmationDeadline: data.confirmationDeadline.toISOString(),
            deliveryDeadline: data.deliveryDeadline.toISOString(),
            deliveryDate: data.deliveryDate?.toISOString() ?? null,
            pickUpDate: data.pickUpDate?.toISOString() ?? null,
            shipmentDate: data.shipmentDate?.toISOString() ?? null,
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
  "tracking",
  "deliveryDate",
  "pickUpDate",
  "shipmentDate",
  "invoiceNumber",
  "cartonLabels",
  "bol",
  "palletLabels",
  "asn",
  "carrierLabels",
  "carrierLabelType",
  "packingSlip",
] as const satisfies readonly (keyof VendorOrder)[];

type AuditScalar = string | number | boolean | null;

function serializeForAudit(value: string | number | boolean | Date | null): AuditScalar {
  return value instanceof Date ? value.toISOString() : value;
}

export async function editVendorOrder(
  orderId: string,
  input: VendorOrderOperationalFields,
  context: VendorOrderActorContext,
): Promise<EditVendorOrderResult> {
  const checklistIssues = validateShippingChecklistConsistency(input);
  if (checklistIssues.length > 0) {
    return { ok: false, error: "CHECKLIST_INVALID", issues: checklistIssues };
  }

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
