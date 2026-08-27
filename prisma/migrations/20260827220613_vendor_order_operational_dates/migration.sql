-- Cambio: fechas operativas reales (Delivery Date, Pick Up Date, Shipment
-- Date) + Packing Slip. Puramente aditivo, todas nullable: una orden nueva o
-- histórica que no pasó por el nuevo formulario simplemente queda en NULL.
ALTER TABLE "vendor_orders" ADD COLUMN     "delivery_date" TIMESTAMP(3),
ADD COLUMN     "packing_slip" BOOLEAN,
ADD COLUMN     "pick_up_date" TIMESTAMP(3),
ADD COLUMN     "shipment_date" TIMESTAMP(3);
