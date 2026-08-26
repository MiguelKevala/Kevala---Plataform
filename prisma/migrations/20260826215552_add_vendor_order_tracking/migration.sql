-- CreateEnum
CREATE TYPE "vendor_order_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'DELIVERED');

-- CreateTable
CREATE TABLE "vendor_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "amazon_order_id" TEXT,
    "status" "vendor_order_status" NOT NULL DEFAULT 'PENDING',
    "order_date" TIMESTAMP(3) NOT NULL,
    "confirmation_deadline" TIMESTAMP(3),
    "delivery_deadline" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_order_status_history" (
    "id" TEXT NOT NULL,
    "vendor_order_id" TEXT NOT NULL,
    "previous_status" "vendor_order_status",
    "new_status" "vendor_order_status" NOT NULL,
    "changed_by" TEXT,
    "reason" TEXT,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_orders_order_number_key" ON "vendor_orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_orders_amazon_order_id_key" ON "vendor_orders"("amazon_order_id");

-- CreateIndex
CREATE INDEX "vendor_orders_status_idx" ON "vendor_orders"("status");

-- CreateIndex
CREATE INDEX "vendor_orders_order_date_idx" ON "vendor_orders"("order_date");

-- CreateIndex
CREATE INDEX "vendor_order_status_history_vendor_order_id_idx" ON "vendor_order_status_history"("vendor_order_id");

-- AddForeignKey
ALTER TABLE "vendor_order_status_history" ADD CONSTRAINT "vendor_order_status_history_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_order_status_history" ADD CONSTRAINT "vendor_order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

