import { z } from "zod";

export const UNIT_OF_MEASUREMENT_VALUES = ["LB", "Gal", "Oz", "Drum", "Tote", "Sticks"] as const;
export type UnitOfMeasurementValue = (typeof UNIT_OF_MEASUREMENT_VALUES)[number];

// Fase 9: mercados donde puede venderse un producto. Conjunto cerrado y fijo,
// igual que UnitOfMeasurement — pero un producto puede pertenecer a varios a
// la vez, así que el campo es un array, no un valor único.
export const COUNTRY_VALUES = ["USA", "Mexico", "Canada"] as const;
export type CountryValue = (typeof COUNTRY_VALUES)[number];

const SKU_MAX_LENGTH = 50;
const SKU_PATTERN = /^[A-Za-z0-9]+$/;
const ITEM_MAX_LENGTH = 300;
const ASIN_MAX_LENGTH = 32;
const ASIN_PATTERN = /^[A-Za-z0-9]+$/;
const LINK_MAX_LENGTH = 2048;

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
  // Opcionales a diferencia de ASIN: no todo producto del catálogo tiene
  // presencia en Amazon todavía. country default [] cuando no se envía.
  country: z.array(z.enum(COUNTRY_VALUES)).optional().default([]),
  link: z
    .string()
    .trim()
    .max(LINK_MAX_LENGTH, `Link cannot exceed ${LINK_MAX_LENGTH} characters.`)
    .nullable()
    .optional()
    // Vacío/ausente -> null (sin link). Solo se valida el formato URL cuando
    // sí viene un valor — así un frontend que siempre envía "" para "sin
    // link" no falla la validación.
    .transform((value) => (value && value.trim() !== "" ? value : null))
    .refine((value) => value === null || /^https?:\/\/.+/i.test(value), {
      message: "Link must be a valid URL.",
    }),
});

export type ProductInput = z.infer<typeof productInputSchema>;
