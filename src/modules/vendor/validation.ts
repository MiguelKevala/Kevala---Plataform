import { z } from "zod";

const REASON_MAX_LENGTH = 500;
const COMMENTS_MAX_LENGTH = 1000;

export const rejectVendorOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required.")
    .max(REASON_MAX_LENGTH, `Reason cannot exceed ${REASON_MAX_LENGTH} characters.`),
  comments: z
    .string()
    .trim()
    .max(COMMENTS_MAX_LENGTH, `Comments cannot exceed ${COMMENTS_MAX_LENGTH} characters.`)
    .optional(),
});

export type RejectVendorOrderInput = z.infer<typeof rejectVendorOrderSchema>;

const PO_NUMBER_MAX_LENGTH = 100;

const orderInformationShape = {
  orderDate: z.coerce.date(),
  confirmationDeadline: z.coerce.date().nullable().optional(),
  deliveryDeadline: z.coerce.date().nullable().optional(),
  carrierId: z.string().trim().min(1, "Carrier is required."),
  modeId: z.string().trim().min(1, "Mode is required."),
  invoiceNumber: z
    .number()
    .int("Invoice # must be a whole number.")
    .nonnegative("Invoice # cannot be negative.")
    .nullable()
    .optional(),
  cartonLabels: z.boolean(),
  bol: z.boolean(),
  palletLabels: z.boolean(),
  upsLabels: z.boolean(),
  ontracLabels: z.boolean(),
  amzx: z.boolean(),
  asn: z.boolean(),
};

export const createVendorOrderSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(1, "PO # is required.")
    .max(PO_NUMBER_MAX_LENGTH, `PO # cannot exceed ${PO_NUMBER_MAX_LENGTH} characters.`),
  ...orderInformationShape,
});

export type CreateVendorOrderInput = z.infer<typeof createVendorOrderSchema>;

// PO # es inmutable después de crear la orden (decisión de negocio aprobada
// en Fase 8): el schema de edición no lo incluye, así que no puede llegar en
// el payload aunque el formulario lo muestre solo como texto no editable.
export const editVendorOrderSchema = z.object(orderInformationShape);

export type EditVendorOrderInput = z.infer<typeof editVendorOrderSchema>;
