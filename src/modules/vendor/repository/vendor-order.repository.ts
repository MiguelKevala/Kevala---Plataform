import { prisma } from "@/lib/prisma";
import type { VendorOrderStatus } from "@/generated/prisma/client";
import { VENDOR_ORDER_STATUSES } from "../status";

export async function getOrderCountsByStatus(): Promise<Record<VendorOrderStatus, number>> {
  const counts = await prisma.vendorOrder.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const result = Object.fromEntries(
    VENDOR_ORDER_STATUSES.map((status) => [status, 0]),
  ) as Record<VendorOrderStatus, number>;

  for (const row of counts) {
    result[row.status] = row._count._all;
  }

  return result;
}

export async function getRecentPendingOrders(limit = 10) {
  return prisma.vendorOrder.findMany({
    where: { status: "PENDING" },
    orderBy: { orderDate: "desc" },
    take: limit,
  });
}

export interface ListVendorOrdersParams {
  search?: string;
  status?: VendorOrderStatus;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

export interface ListVendorOrdersResult {
  items: Awaited<ReturnType<typeof prisma.vendorOrder.findMany>>;
  total: number;
}

export async function listVendorOrders(
  params: ListVendorOrdersParams,
): Promise<ListVendorOrdersResult> {
  const { search, status, dateFrom, dateTo, page, pageSize } = params;

  const where = {
    ...(search ? { orderNumber: { contains: search, mode: "insensitive" as const } } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          orderDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.vendorOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vendorOrder.count({ where }),
  ]);

  return { items, total };
}

export async function getVendorOrderWithHistory(id: string) {
  return prisma.vendorOrder.findUnique({
    where: { id },
    include: {
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { changedByUser: { select: { id: true, name: true } } },
      },
    },
  });
}
