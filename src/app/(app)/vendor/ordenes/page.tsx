import Link from "next/link";
import { Button, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { VendorStatusBadge } from "@/components/vendor";
import { formatDate } from "@/lib/format-date";
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

function isVendorOrderStatus(value: string | undefined): value is VendorOrderStatus {
  return VENDOR_ORDER_STATUSES.includes(value as VendorOrderStatus);
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
  const status = isVendorOrderStatus(statusParam) ? statusParam : undefined;
  const from = firstValue(resolvedParams.from);
  const to = firstValue(resolvedParams.to);
  const page = Math.max(1, Number(firstValue(resolvedParams.page)) || 1);

  const { items, total } = await listVendorOrders({
    search,
    status,
    dateFrom: from ? new Date(from) : undefined,
    dateTo: to ? new Date(to) : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const persistedParams = { q: search, status, from, to };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-neutral-900">Órdenes Vendor</h1>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <Input label="Buscar por PO" name="q" defaultValue={search} placeholder="PO-0001" />
        <Select label="Estado" name="status" defaultValue={status ?? ""}>
          <option value="">Todos</option>
          {VENDOR_ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {VENDOR_ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Input label="Fecha desde" type="date" name="from" defaultValue={from} />
        <Input label="Fecha hasta" type="date" name="to" defaultValue={to} />
        <Button type="submit">Buscar</Button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {total === 0 && !search && !status && !from && !to
            ? "No hay órdenes registradas todavía."
            : "No se encontraron órdenes con los filtros aplicados."}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Fecha de orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha límite relevante</TableHead>
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
                  <TableCell>{formatDate(getRelevantDeadline(order))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>
              Página {page} de {totalPages} — {total} orden{total === 1 ? "" : "es"}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={buildPageHref(persistedParams, page - 1)}>
                  <Button variant="outline" size="sm">
                    Anterior
                  </Button>
                </Link>
              )}
              {page < totalPages && (
                <Link href={buildPageHref(persistedParams, page + 1)}>
                  <Button variant="outline" size="sm">
                    Siguiente
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
