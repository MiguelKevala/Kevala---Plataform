import type { VendorOrderStatus } from "@/generated/prisma/client";

export interface VendorOrderDeadlineFields {
  status: VendorOrderStatus;
  confirmationDeadline: Date | null;
  deliveryDeadline: Date | null;
}

/**
 * PENDING -> fecha límite de confirmación; CONFIRMED -> fecha límite de entrega;
 * REJECTED/DELIVERED -> ya no hay fecha límite relevante.
 */
export function getRelevantDeadline(order: VendorOrderDeadlineFields): Date | null {
  if (order.status === "PENDING") return order.confirmationDeadline;
  if (order.status === "CONFIRMED") return order.deliveryDeadline;
  return null;
}
