-- AlterTable
ALTER TABLE "vendor_orders" ADD COLUMN     "amzx" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "asn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bol" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "carrier_id" TEXT,
ADD COLUMN     "carton_labels" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoice_number" BIGINT,
ADD COLUMN     "mode_id" TEXT,
ADD COLUMN     "ontrac_labels" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pallet_labels" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ups_labels" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "carriers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carriers_name_key" ON "carriers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "modes_name_key" ON "modes"("name");

-- CreateIndex
CREATE INDEX "vendor_orders_carrier_id_idx" ON "vendor_orders"("carrier_id");

-- CreateIndex
CREATE INDEX "vendor_orders_mode_id_idx" ON "vendor_orders"("mode_id");

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_mode_id_fkey" FOREIGN KEY ("mode_id") REFERENCES "modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
