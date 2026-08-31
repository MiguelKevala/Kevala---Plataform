import { z } from "zod";
import { COUNTRY_VALUES, type CountryValue } from "@/modules/products/validation";

const DESCRIPTION_MAX_LENGTH = 500;

/** Orden fijo (el mismo orden del enum) para que dos selecciones del mismo
 * conjunto de mercados, sin importar el orden en que se eligieron o
 * aparecieron en el Excel, siempre se guarden idénticas — necesario para
 * que la restricción UNIQUE que incluye `country` (arrays de Postgres
 * comparan por igualdad exacta, incluido el orden) detecte correctamente
 * los duplicados reales. */
export function sortCountries(countries: readonly CountryValue[]): CountryValue[] {
  return [...countries].sort((a, b) => COUNTRY_VALUES.indexOf(a) - COUNTRY_VALUES.indexOf(b));
}

const periodFieldsShape = {
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  unitsSold: z
    .number()
    .finite("Units Sold must be a valid number.")
    .int("Units Sold must be a whole number.")
    .nonnegative("Units Sold cannot be negative."),
  unitsAvailable: z
    .number()
    .finite("Units Available must be a valid number.")
    .int("Units Available must be a whole number.")
    .nonnegative("Units Available cannot be negative."),
};

/** Product no forma parte del shape editable — es fijo una vez creado el
 * periodo (mismo principio que "no modificar el producto desde el
 * periodo"): create lo exige explícitamente, edit nunca lo acepta. */
export const createCosmoPeriodSchema = z
  .object({
    productId: z.string().trim().min(1, "Product is required."),
    ...periodFieldsShape,
  })
  .refine((data) => data.startDate.getTime() <= data.endDate.getTime(), {
    message: "Start Date must be on or before End Date.",
    path: ["endDate"],
  });

export type CreateCosmoPeriodInput = z.infer<typeof createCosmoPeriodSchema>;

export const editCosmoPeriodSchema = z
  .object(periodFieldsShape)
  .refine((data) => data.startDate.getTime() <= data.endDate.getTime(), {
    message: "Start Date must be on or before End Date.",
    path: ["endDate"],
  });

export type EditCosmoPeriodInput = z.infer<typeof editCosmoPeriodSchema>;

const changeDescriptionField = z
  .string()
  .trim()
  .min(1, "Description is required.")
  .max(DESCRIPTION_MAX_LENGTH, `Description cannot exceed ${DESCRIPTION_MAX_LENGTH} characters.`);

/** Al menos un mercado. Solo valida forma (¿son valores del enum?) — que
 * cada mercado elegido pertenezca a los configurados en el Product se
 * valida en el servicio, porque requiere leer el producto (cosmo-change-
 * crud.service.ts). Se deduplica y ordena de forma canónica (ver
 * sortCountries) para que el UNIQUE de la base de datos funcione
 * correctamente sin importar el orden de selección. */
const changeCountryField = z
  .array(z.enum(COUNTRY_VALUES))
  .min(1, "At least one market is required.")
  .transform((countries) => sortCountries([...new Set(countries)]));

/** El usuario nunca elige el periodo manualmente (decisión de negocio de la
 * Fase 9): se resuelve en el servicio a partir de productId + changeDate. */
export const createCosmoChangeSchema = z.object({
  productId: z.string().trim().min(1, "Product is required."),
  changeDate: z.coerce.date(),
  description: changeDescriptionField,
  country: changeCountryField,
});

export type CreateCosmoChangeInput = z.infer<typeof createCosmoChangeSchema>;

export const editCosmoChangeSchema = z.object({
  changeDate: z.coerce.date(),
  description: changeDescriptionField,
  country: changeCountryField,
});

export type EditCosmoChangeInput = z.infer<typeof editCosmoChangeSchema>;
