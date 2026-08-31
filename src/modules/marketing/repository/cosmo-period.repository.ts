import { prisma } from "@/lib/prisma";

export async function listPeriodsByProduct(productId: string) {
  return prisma.cosmoPeriod.findMany({
    where: { productId },
    orderBy: { startDate: "asc" },
    include: { changes: { orderBy: { changeDate: "asc" } } },
  });
}

export async function getPeriodById(id: string) {
  return prisma.cosmoPeriod.findUnique({ where: { id } });
}

/** Implementa la regla changeDate >= startDate AND changeDate <= endDate
 * directamente en la consulta (evita traer todos los periodos del producto
 * para filtrar en memoria). Si por algún motivo hubiera más de un periodo
 * que contenga la fecha, se toma el más antiguo de forma determinística. */
export async function findPeriodContainingDate(productId: string, date: Date) {
  return prisma.cosmoPeriod.findFirst({
    where: { productId, startDate: { lte: date }, endDate: { gte: date } },
    orderBy: { startDate: "asc" },
  });
}
