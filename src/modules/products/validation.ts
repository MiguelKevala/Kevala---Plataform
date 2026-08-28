import { z } from "zod";

export const UNIT_OF_MEASUREMENT_VALUES = ["LB", "Gal", "Oz", "Drum", "Tote", "Sticks"] as const;
export type UnitOfMeasurementValue = (typeof UNIT_OF_MEASUREMENT_VALUES)[number];

const SKU_MAX_LENGTH = 50;
const SKU_PATTERN = /^[A-Za-z0-9]+$/;
const ITEM_MAX_LENGTH = 300;
const ASIN_MAX_LENGTH = 32;
const ASIN_PATTERN = /^[A-Za-z0-9]+$/;

export const productInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required.")
    .max(SKU_MAX_LENGTH, `SKU cannot exceed ${SKU_MAX_LENGTH} characters.`)
    .regex(SKU_PATTERN, "SKU may only contain letters and numbers."),
  item: z
    .string()
    .trim()
    .min(1, "Item is required.")
    .max(ITEM_MAX_LENGTH, `Item cannot exceed ${ITEM_MAX_LENGTH} characters.`),
  // ASIN es un identificador independiente del SKU (el de Amazon). Igual que
  // SKU: solo trim, sin normalización de mayúsculas/minúsculas — el catálogo
  // no tiene esa convención para ningún otro identificador.
  asin: z
    .string()
    .trim()
    .min(1, "ASIN is required.")
    .max(ASIN_MAX_LENGTH, `ASIN cannot exceed ${ASIN_MAX_LENGTH} characters.`)
    .regex(ASIN_PATTERN, "ASIN may only contain letters and numbers."),
  caseOf: z
    .number()
    .finite("Case Of must be a valid number.")
    .int("Case Of must be a whole number.")
    .positive("Case Of must be greater than 0."),
  casesPerPallet: z
    .number()
    .finite("Cases Per Pallet must be a valid number.")
    .int("Cases Per Pallet must be a whole number.")
    .positive("Cases Per Pallet must be greater than 0."),
  unitOfMeasurement: z.enum(UNIT_OF_MEASUREMENT_VALUES),
  unit: z.number().finite("Unit must be a valid number.").positive("Unit must be greater than 0."),
});

export type ProductInput = z.infer<typeof productInputSchema>;
