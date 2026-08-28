import { z } from "zod";

export const UNIT_OF_MEASUREMENT_VALUES = ["LB", "Gal", "Oz", "Drum", "Tote", "Sticks"] as const;
export type UnitOfMeasurementValue = (typeof UNIT_OF_MEASUREMENT_VALUES)[number];

const SKU_MAX_LENGTH = 50;
const SKU_PATTERN = /^[A-Za-z0-9]+$/;
const ITEM_MAX_LENGTH = 300;

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
