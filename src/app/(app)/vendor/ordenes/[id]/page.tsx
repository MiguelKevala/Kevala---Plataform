import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle, Checkbox } from "@/components/ui";
import { VendorOrderActions, VendorStatusBadge } from "@/components/vendor";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS, type PermissionKey } from "@/modules/rbac/permissions";
import { getVendorOrderWithHistory } from "@/modules/vendor/repository/vendor-order.repository";
import { VENDOR_ORDER_STATUS_LABELS } from "@/modules/vendor/status";

interface VendorOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

const CHECKLIST_ITEMS: Array<{ key: "cartonLabels" | "bol" | "palletLabels" | "upsLabels" | "ontracLabels" | "amzx" | "asn"; label: string }> = [
  { key: "cartonLabels", label: "Carton Labels" },
  { key: "bol", label: "BOL" },
  { key: "palletLabels", label: "Pallet Labels" },
  { key: "upsLabels", label: "UPS Labels" },
  { key: "ontracLabels", label: "OnTrac Labels" },
  { key: "amzx", label: "AMZX" },
  { key: "asn", label: "ASN" },
];

export default async function VendorOrderDetailPage({ params }: VendorOrderDetailPageProps) {
  const { id } = await params;
  const order = await getVendorOrderWithHistory(id);

  if (!order) {
    notFound();
  }

  const session = await getCurrentSession();
  const permissions: Set<PermissionKey> = session
    ? await getUserPermissions(session.user.id)
    : new Set();

  const rejection =
    order.status === "REJECTED"
      ? order.statusHistory.find((entry) => entry.newStatus === "REJECTED")
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-neutral-900">{order.orderNumber}</h1>
          <VendorStatusBadge status={order.status} />
        </div>
        <div className="flex items-center gap-3">
          <VendorOrderActions
            orderId={order.id}
            status={order.status}
            canConfirm={permissions.has(PERMISSIONS.VENDOR_ORDERS_CONFIRM)}
            canReject={permissions.has(PERMISSIONS.VENDOR_ORDERS_REJECT)}
            canDeliver={permissions.has(PERMISSIONS.VENDOR_ORDERS_DELIVER)}
          />
          {permissions.has(PERMISSIONS.VENDOR_ORDERS_EDIT) && (
            <Link href={`/vendor/ordenes/${order.id}/edit`}>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </Link>
          )}
          <Link href="/vendor/ordenes">
            <Button variant="outline" size="sm">
              Back to Orders
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-neutral-500">PO #</dt>
              <dd className="text-sm font-medium text-neutral-900">{order.orderNumber}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Status</dt>
              <dd className="text-sm font-medium text-neutral-900">
                {VENDOR_ORDER_STATUS_LABELS[order.status]}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Order Date</dt>
              <dd className="text-sm font-medium text-neutral-900">{formatDate(order.orderDate)}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Confirmation Deadline</dt>
              <dd className="text-sm font-medium text-neutral-900">
                {formatDate(order.confirmationDeadline)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Delivery Deadline</dt>
              <dd className="text-sm font-medium text-neutral-900">{formatDate(order.deliveryDeadline)}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Carrier</dt>
              <dd className="text-sm font-medium text-neutral-900">{order.carrier?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Mode</dt>
              <dd className="text-sm font-medium text-neutral-900">{order.mode?.name ?? "—"}</dd>
            </div>
            {(order.status === "CONFIRMED" || order.status === "DELIVERED") && (
              <div>
                <dt className="text-sm text-neutral-500">Confirmed On</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {formatDateTime(order.confirmedAt)}
                </dd>
              </div>
            )}
            {order.status === "DELIVERED" && (
              <div>
                <dt className="text-sm text-neutral-500">Delivered On</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {formatDateTime(order.deliveredAt)}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CHECKLIST_ITEMS.map((item) => (
              <Checkbox key={item.key} label={item.label} checked={order[item.key]} disabled />
            ))}
          </div>
          <div className="mt-4">
            <dt className="text-sm text-neutral-500">Invoice #</dt>
            <dd className="text-sm font-medium text-neutral-900">{order.invoiceNumber ?? "—"}</dd>
          </div>
        </CardContent>
      </Card>

      {order.status === "REJECTED" && (
        <Card>
          <CardHeader>
            <CardTitle>Rejection Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-sm text-neutral-500">Rejected On</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {formatDateTime(order.rejectedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">Reason</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {rejection?.reason ?? "—"}
                </dd>
              </div>
              {rejection?.comments && (
                <div>
                  <dt className="text-sm text-neutral-500">Comments</dt>
                  <dd className="text-sm font-medium text-neutral-900">{rejection.comments}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Status History</CardTitle>
        </CardHeader>
        <CardContent>
          {order.statusHistory.length === 0 ? (
            <p className="text-sm text-neutral-500">No events recorded.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {order.statusHistory.map((entry) => (
                <li key={entry.id} className="border-l-2 border-neutral-200 pl-4">
                  <p className="text-sm font-medium text-neutral-900">
                    {entry.previousStatus ? VENDOR_ORDER_STATUS_LABELS[entry.previousStatus] : "Created"}
                    {" → "}
                    {VENDOR_ORDER_STATUS_LABELS[entry.newStatus]}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {formatDateTime(entry.createdAt)} — {entry.changedByUser?.name ?? "System"}
                  </p>
                  {entry.reason && (
                    <p className="mt-1 text-sm text-neutral-700">Reason: {entry.reason}</p>
                  )}
                  {entry.comments && (
                    <p className="text-sm text-neutral-700">Comments: {entry.comments}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
