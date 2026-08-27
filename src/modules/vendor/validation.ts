import { z } from "zod";

const REASON_MAX_LENGTH = 500;
const COMMENTS_MAX_LENGTH = 1000;

export const rejectVendorOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "El motivo es obligatorio.")
    .max(REASON_MAX_LENGTH, `El motivo no puede superar ${REASON_MAX_LENGTH} caracteres.`),
  comments: z
    .string()
    .trim()
    .max(COMMENTS_MAX_LENGTH, `Los comentarios no pueden superar ${COMMENTS_MAX_LENGTH} caracteres.`)
    .optional(),
});

export type RejectVendorOrderInput = z.infer<typeof rejectVendorOrderSchema>;
