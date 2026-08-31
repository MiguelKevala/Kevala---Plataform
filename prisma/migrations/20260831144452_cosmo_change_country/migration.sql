-- Cosmo Change por mercado: cada Change ahora indica a qué mercado(s)
-- aplica (subconjunto de los países configurados en el producto). Aditiva:
-- agrega la columna y reemplaza el índice único para incluirla (la tabla
-- cosmo_changes está vacía en este momento, sin riesgo de pérdida de datos).

-- DropIndex
DROP INDEX "cosmo_changes_cosmo_period_id_change_date_description_key";

-- AlterTable
ALTER TABLE "cosmo_changes" ADD COLUMN     "country" "country"[] DEFAULT ARRAY[]::"country"[];

-- CreateIndex
CREATE UNIQUE INDEX "cosmo_changes_cosmo_period_id_change_date_description_count_key" ON "cosmo_changes"("cosmo_period_id", "change_date", "description", "country");
