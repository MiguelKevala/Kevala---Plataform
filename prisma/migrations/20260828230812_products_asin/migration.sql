-- Fase ASIN: agrega el identificador de Amazon al catálogo de productos.
-- Aditiva y segura para datos existentes: la columna se crea nullable a
-- propósito porque el catálogo ya tenía productos sin ASIN al momento de
-- esta migración y no se deben inventar valores para ellos. La
-- obligatoriedad para Create/Edit se aplica en la capa de aplicación
-- (validation.ts), no en el esquema. El índice único protege la unicidad
-- incluso con columnas nulas (Postgres permite múltiples NULL en UNIQUE).

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "asin" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "products_asin_key" ON "products"("asin");
