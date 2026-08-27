import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
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
          <Link href="/vendor/ordenes">
            <Button variant="outline" size="sm">
              Volver a Órdenes
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fechas</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-neutral-500">Fecha de orden</dt>
              <dd className="text-sm font-medium text-neutral-900">
                {formatDate(order.orderDate)}
              </dd>
            </div>
            {order.confirmationDeadline && (
              <div>
                <dt className="text-sm text-neutral-500">Fecha límite de confirmación</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {formatDate(order.confirmationDeadline)}
                </dd>
              </div>
            )}
            {order.deliveryDeadline && (
              <div>
                <dt className="text-sm text-neutral-500">Fecha límite de entrega</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {formatDate(order.deliveryDeadline)}
                </dd>
              </div>
            )}
            {(order.status === "CONFIRMED" || order.status === "DELIVERED") && (
              <div>
                <dt className="text-sm text-neutral-500">Confirmada el</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {formatDateTime(order.confirmedAt)}
                </dd>
              </div>
            )}
            {order.status === "DELIVERED" && (
              <div>
                <dt className="text-sm text-neutral-500">Entregada el</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {formatDateTime(order.deliveredAt)}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {order.status === "REJECTED" && (
        <Card>
          <CardHeader>
            <CardTitle>Rechazo</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-sm text-neutral-500">Rechazada el</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {formatDateTime(order.rejectedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">Motivo</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {rejection?.reason ?? "—"}
                </dd>
              </div>
              {rejection?.comments && (
                <div>
                  <dt className="text-sm text-neutral-500">Comentarios</dt>
                  <dd className="text-sm font-medium text-neutral-900">{rejection.comments}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent>
          {order.statusHistory.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin eventos registrados.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {order.statusHistory.map((entry) => (
                <li key={entry.id} className="border-l-2 border-neutral-200 pl-4">
                  <p className="text-sm font-medium text-neutral-900">
                    {entry.previousStatus ? VENDOR_ORDER_STATUS_LABELS[entry.previousStatus] : "Registro"}
                    {" → "}
                    {VENDOR_ORDER_STATUS_LABELS[entry.newStatus]}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {formatDateTime(entry.createdAt)} — {entry.changedByUser?.name ?? "Sistema"}
                  </p>
                  {entry.reason && (
                    <p className="mt-1 text-sm text-neutral-700">Motivo: {entry.reason}</p>
                  )}
                  {entry.comments && (
                    <p className="text-sm text-neutral-700">Comentarios: {entry.comments}</p>
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
