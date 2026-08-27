import { Badge } from "@/components/ui";
import type { VendorOrderStatus } from "@/generated/prisma/client";
import { VENDOR_ORDER_STATUS_BADGE_VARIANT, VENDOR_ORDER_STATUS_LABELS } from "@/modules/vendor/status";

export interface VendorStatusBadgeProps {
  status: VendorOrderStatus;
}

export function VendorStatusBadge({ status }: VendorStatusBadgeProps) {
  return (
    <Badge variant={VENDOR_ORDER_STATUS_BADGE_VARIANT[status]}>
      {VENDOR_ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
