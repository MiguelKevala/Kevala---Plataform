import type { VendorOrderStatus } from "@/generated/prisma/client";

export type VendorOrderAction = "confirm" | "reject" | "deliver";

interface VendorOrderTransition {
  from: VendorOrderStatus;
  to: VendorOrderStatus;
}

/**
 * Única fuente de verdad de la máquina de estados aprobada para Fase 6.
 * REJECTED y DELIVERED son finales: no aparecen como `from` de ninguna acción.
 */
export const VENDOR_ORDER_TRANSITIONS: Record<VendorOrderAction, VendorOrderTransition> = {
  confirm: { from: "PENDING", to: "CONFIRMED" },
  reject: { from: "PENDING", to: "REJECTED" },
  deliver: { from: "CONFIRMED", to: "DELIVERED" },
};

export function canPerformVendorOrderAction(
  action: VendorOrderAction,
  currentStatus: VendorOrderStatus,
): boolean {
  return VENDOR_ORDER_TRANSITIONS[action].from === currentStatus;
}
