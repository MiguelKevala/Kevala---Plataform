export type VendorOrderNotificationEvent = "confirmed" | "rejected" | "delivered";

export interface VendorOrderNotificationContentInput {
  event: VendorOrderNotificationEvent;
  orderNumber: string;
}

export interface NotificationContent {
  type: string;
  title: string;
  message: string;
}

const VENDOR_ORDER_NOTIFICATION_TYPE: Record<VendorOrderNotificationEvent, string> = {
  confirmed: "VENDOR_ORDER_CONFIRMED",
  rejected: "VENDOR_ORDER_REJECTED",
  delivered: "VENDOR_ORDER_DELIVERED",
};

/**
 * Contenido de las notificaciones para los 3 eventos Vendor con disparador real
 * en V1 (Fase 7). Los tipos del documento maestro que dependen de creación de
 * órdenes o de automatización de deadlines (VENDOR_ORDER_RECEIVED,
 * *_REMINDER, *_OVERDUE) no tienen disparador todavía y no se generan aquí.
 */
export function buildVendorOrderNotificationContent(
  input: VendorOrderNotificationContentInput,
): NotificationContent {
  const { event, orderNumber } = input;
  const type = VENDOR_ORDER_NOTIFICATION_TYPE[event];

  switch (event) {
    case "confirmed":
      return { type, title: "Orden confirmada", message: `La orden ${orderNumber} fue confirmada.` };
    case "rejected":
      return { type, title: "Orden rechazada", message: `La orden ${orderNumber} fue rechazada.` };
    case "delivered":
      return {
        type,
        title: "Orden entregada",
        message: `La orden ${orderNumber} fue marcada como entregada.`,
      };
  }
}
