import { z } from "zod";
import { CARRIER_LABEL_TYPES } from "./domain/shipping-checklist";

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
const TRACKING_MAX_LENGTH = 50;
const TRACKING_PATTERN = /^[A-Za-z0-9-]+$/;

// Carrier/Mode son opcionales al crear/editar (Amazon puede asignarlos
// después); "" desde el <select> "Not assigned" se normaliza a null.
const optionalIdField = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

const orderInformationShape = {
  orderDate: z.coerce.date(),
  // Confirmation Deadline y Delivery Deadline NO se capturan manualmente:
  // el backend las recalcula siempre a partir de orderDate (ver
  // src/modules/vendor/domain/vendor-order-deadlines.ts), así que no forman
  // parte del payload de entrada.
  carrierId: optionalIdField,
  modeId: optionalIdField,
  tracking: z
    .string()
    .trim()
    .max(TRACKING_MAX_LENGTH, `Tracking cannot exceed ${TRACKING_MAX_LENGTH} characters.`)
    .regex(TRACKING_PATTERN, "Tracking may only contain letters, numbers, and hyphens.")
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  deliveryDate: z.coerce.date().nullable().optional(),
  pickUpDate: z.coerce.date().nullable().optional(),
  shipmentDate: z.coerce.date().nullable().optional(),
  invoiceNumber: z
    .number()
    .int("Invoice # must be a whole number.")
    .nonnegative("Invoice # cannot be negative.")
    .nullable()
    .optional(),
  cartonLabels: z.boolean().nullable().optional(),
  bol: z.boolean().nullable().optional(),
  palletLabels: z.boolean().nullable().optional(),
  asn: z.boolean().nullable().optional(),
  carrierLabels: z.boolean().nullable().optional(),
  carrierLabelType: z.enum(CARRIER_LABEL_TYPES).nullable().optional(),
  packingSlip: z.boolean().nullable().optional(),
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
