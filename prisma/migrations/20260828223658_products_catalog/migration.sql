-- Products: catálogo maestro de productos de KEVALA (módulo nuevo, sección
-- Catalog). Migración puramente aditiva: nueva tabla + nuevo enum, no toca
-- ninguna tabla existente.

-- CreateEnum
CREATE TYPE "unit_of_measurement" AS ENUM ('LB', 'Gal', 'Oz', 'Drum', 'Tote', 'Sticks');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "case_of" INTEGER NOT NULL,
    "cases_per_pallet" INTEGER NOT NULL,
    "unit_of_measurement" "unit_of_measurement" NOT NULL,
    "unit" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
