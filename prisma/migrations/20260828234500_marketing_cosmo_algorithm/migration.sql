-- Fase 9 (Marketing / Cosmo - Algorithm). Aditiva en su totalidad:
--   - products: agrega country (array, mercados donde se vende) y link
--     (URL de Amazon), ambos nullable/opcionales — no pierde ni modifica
--     ningún producto existente.
--   - cosmo_periods / cosmo_changes: tablas nuevas, normalizan el Excel de
--     seguimiento manual. Sin "week number": cada periodo se identifica por
--     su rango de fechas exacto (start_date/end_date).

-- CreateEnum
CREATE TYPE "country" AS ENUM ('USA', 'Mexico', 'Canada');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "country" "country"[] DEFAULT ARRAY[]::"country"[],
ADD COLUMN     "link" TEXT;

-- CreateTable
CREATE TABLE "cosmo_periods" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "units_sold" INTEGER NOT NULL,
    "units_available" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cosmo_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cosmo_changes" (
    "id" TEXT NOT NULL,
    "cosmo_period_id" TEXT NOT NULL,
    "change_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cosmo_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cosmo_periods_product_id_idx" ON "cosmo_periods"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "cosmo_periods_product_id_start_date_end_date_key" ON "cosmo_periods"("product_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "cosmo_changes_cosmo_period_id_idx" ON "cosmo_changes"("cosmo_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "cosmo_changes_cosmo_period_id_change_date_description_key" ON "cosmo_changes"("cosmo_period_id", "change_date", "description");

-- AddForeignKey
ALTER TABLE "cosmo_periods" ADD CONSTRAINT "cosmo_periods_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosmo_changes" ADD CONSTRAINT "cosmo_changes_cosmo_period_id_fkey" FOREIGN KEY ("cosmo_period_id") REFERENCES "cosmo_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
