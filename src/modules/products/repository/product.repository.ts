import { prisma } from "@/lib/prisma";

export interface ListProductsParams {
  search?: string;
  page: number;
  pageSize: number;
}

export interface ListProductsResult {
  items: Awaited<ReturnType<typeof prisma.product.findMany>>;
  total: number;
}

/** Solo lista productos activos: uno "eliminado" (soft delete via isActive)
 * ya no debe aparecer en el catálogo. */
export async function listProducts(params: ListProductsParams): Promise<ListProductsResult> {
  const { search, page, pageSize } = params;

  const where = {
    isActive: true,
    ...(search
      ? {
          OR: [
            { sku: { contains: search, mode: "insensitive" as const } },
            { item: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { sku: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total };
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({ where: { id } });
}
