import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { OrderCountCard, VendorStatusBadge } from "@/components/vendor";
import { formatDate } from "@/lib/format-date";
import {
  getOrderCountsByStatus,
  getRecentPendingOrders,
} from "@/modules/vendor/repository/vendor-order.repository";

export default async function VendorDashboardPage() {
  const [counts, pendingOrders] = await Promise.all([
    getOrderCountsByStatus(),
    getRecentPendingOrders(10),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold text-neutral-900">Vendor — Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OrderCountCard
          label="Pending"
          count={counts.PENDING}
          href="/vendor/ordenes?status=PENDING"
        />
        <OrderCountCard
          label="Confirmed"
          count={counts.CONFIRMED}
          href="/vendor/ordenes?status=CONFIRMED"
        />
        <OrderCountCard
          label="Rejected"
          count={counts.REJECTED}
          href="/vendor/ordenes?status=REJECTED"
        />
        <OrderCountCard
          label="Delivered"
          count={counts.DELIVERED}
          href="/vendor/ordenes?status=DELIVERED"
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-neutral-900">
          Orders requiring attention
        </h2>

        {pendingOrders.length === 0 ? (
          <p className="text-sm text-neutral-500">No orders are pending confirmation.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/vendor/ordenes/${order.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(order.orderDate)}</TableCell>
                  <TableCell>
                    <VendorStatusBadge status={order.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
