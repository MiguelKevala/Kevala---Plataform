import type { VendorOrderStatus } from "@/generated/prisma/client";

export const VENDOR_ORDER_STATUS_LABELS: Record<VendorOrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  DELIVERED: "Delivered",
};

export const VENDOR_ORDER_STATUS_BADGE_VARIANT: Record<
  VendorOrderStatus,
  "warning" | "info" | "danger" | "success"
> = {
  PENDING: "warning",
  CONFIRMED: "info",
  REJECTED: "danger",
  DELIVERED: "success",
};

export const VENDOR_ORDER_STATUSES: VendorOrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "DELIVERED",
];
