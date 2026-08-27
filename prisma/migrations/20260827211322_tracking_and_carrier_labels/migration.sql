-- Fase 8.1: agrega Tracking, colapsa ups_labels/ontrac_labels/amzx en un solo
-- par carrier_labels/carrier_label_type, y vuelve nullable el resto del
-- checklist para distinguir "No" (false) de "no capturado" (NULL).
--
-- Migración de datos (no se pierde ninguna orden existente):
--   - ups_labels/ontrac_labels/amzx = true en cualquiera de los tres
--       -> carrier_labels = true, carrier_label_type = 'UPS' | 'OnTrac' | 'AMZX'
--   - los tres en false (nunca se puede distinguir "No" real de "nunca tocado"
--     con el modelo anterior, que no tenía nullable)
--       -> carrier_labels = NULL, carrier_label_type = NULL
--   - carton_labels/bol/pallet_labels/asn: true se preserva; false histórico
--     (mismo problema de ambigüedad) pasa a NULL.

-- AddColumn
ALTER TABLE "vendor_orders"
  ADD COLUMN "tracking" TEXT,
  ADD COLUMN "carrier_labels" BOOLEAN,
  ADD COLUMN "carrier_label_type" TEXT;

-- Quitar NOT NULL / DEFAULT ANTES de poder escribir NULL en estas columnas
ALTER TABLE "vendor_orders"
  ALTER COLUMN "carton_labels" DROP NOT NULL,
  ALTER COLUMN "carton_labels" DROP DEFAULT,
  ALTER COLUMN "bol" DROP NOT NULL,
  ALTER COLUMN "bol" DROP DEFAULT,
  ALTER COLUMN "pallet_labels" DROP NOT NULL,
  ALTER COLUMN "pallet_labels" DROP DEFAULT,
  ALTER COLUMN "asn" DROP NOT NULL,
  ALTER COLUMN "asn" DROP DEFAULT;

-- Backfill carrier_labels / carrier_label_type desde las 3 columnas viejas
UPDATE "vendor_orders" SET
  "carrier_labels" = CASE
    WHEN "ups_labels" = true OR "ontrac_labels" = true OR "amzx" = true THEN true
    ELSE NULL
  END,
  "carrier_label_type" = CASE
    WHEN "ups_labels" = true THEN 'UPS'
    WHEN "ontrac_labels" = true THEN 'OnTrac'
    WHEN "amzx" = true THEN 'AMZX'
    ELSE NULL
  END;

-- Convierte false histórico (ambiguo: no distingue "No" de "no capturado") a NULL;
-- true se preserva tal cual (señal real e inequívoca).
UPDATE "vendor_orders" SET
  "carton_labels" = CASE WHEN "carton_labels" = true THEN true ELSE NULL END,
  "bol" = CASE WHEN "bol" = true THEN true ELSE NULL END,
  "pallet_labels" = CASE WHEN "pallet_labels" = true THEN true ELSE NULL END,
  "asn" = CASE WHEN "asn" = true THEN true ELSE NULL END;

-- DropColumn (ya migradas)
ALTER TABLE "vendor_orders"
  DROP COLUMN "ups_labels",
  DROP COLUMN "ontrac_labels",
  DROP COLUMN "amzx";
