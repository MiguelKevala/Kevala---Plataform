import Link from "next/link";
import { Button, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { VendorStatusBadge } from "@/components/vendor";
import { formatDate } from "@/lib/format-date";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { getRelevantDeadline } from "@/modules/vendor/get-relevant-deadline";
import { listVendorOrders } from "@/modules/vendor/repository/vendor-order.repository";
import { VENDOR_ORDER_STATUSES, VENDOR_ORDER_STATUS_LABELS } from "@/modules/vendor/status";
import type { VendorOrderStatus } from "@/generated/prisma/client";

const PAGE_SIZE = 20;

interface VendorOrdenesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isVendorOrderStatus(value: string): value is VendorOrderStatus {
  return VENDOR_ORDER_STATUSES.includes(value as VendorOrderStatus);
}

/** Soporta uno o varios estados separados por coma (usado por los accesos
 * "Pending"/"History" del sidebar, que reutilizan esta misma pantalla). */
function parseStatusParam(value: string | undefined): VendorOrderStatus[] {
  if (!value) return [];
  return value.split(",").map((entry) => entry.trim()).filter(isVendorOrderStatus);
}

function buildPageHref(params: Record<string, string | undefined>, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  query.set("page", String(page));
  return `/vendor/ordenes?${query.toString()}`;
}

export default async function VendorOrdenesPage({ searchParams }: VendorOrdenesPageProps) {
  const resolvedParams = await searchParams;

  const search = firstValue(resolvedParams.q);
  const statusParam = firstValue(resolvedParams.status);
  const statuses = parseStatusParam(statusParam);
  const singleStatus = statuses.length === 1 ? statuses[0] : undefined;
  const from = firstValue(resolvedParams.from);
  const to = firstValue(resolvedParams.to);
  const page = Math.max(1, Number(firstValue(resolvedParams.page)) || 1);

  const session = await getCurrentSession();
  const canCreate = session ? (await getUserPermissions(session.user.id)).has(PERMISSIONS.VENDOR_ORDERS_CREATE) : false;

  const { items, total } = await listVendorOrders({
    search,
    status: statuses,
    dateFrom: from ? new Date(from) : undefined,
    dateTo: to ? new Date(to) : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const persistedParams = { q: search, status: statusParam, from, to };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Vendor Orders</h1>
        {canCreate && (
          <Link href="/vendor/ordenes/new">
            <Button>New Order</Button>
          </Link>
        )}
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <Input label="Search by PO" name="q" defaultValue={search} placeholder="PO-0001" />
        <Select label="Status" name="status" defaultValue={singleStatus ?? ""}>
          <option value="">All</option>
          {VENDOR_ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {VENDOR_ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Input label="From Date" type="date" name="from" defaultValue={from} />
        <Input label="To Date" type="date" name="to" defaultValue={to} />
        <Button type="submit">Search</Button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {total === 0 && !search && statuses.length === 0 && !from && !to
            ? "No vendor orders yet."
            : "No orders match the applied filters."}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Relevant Deadline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((order) => (
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
                  <TableCell>{order.carrier?.name ?? "—"}</TableCell>
                  <TableCell>{order.mode?.name ?? "—"}</TableCell>
                  <TableCell>{formatDate(getRelevantDeadline(order))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>
              Page {page} of {totalPages} — {total} order{total === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={buildPageHref(persistedParams, page - 1)}>
                  <Button variant="outline" size="sm">
                    Previous
                  </Button>
                </Link>
              )}
              {page < totalPages && (
                <Link href={buildPageHref(persistedParams, page + 1)}>
                  <Button variant="outline" size="sm">
                    Next
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
