import { prisma } from "@/lib/prisma";

export interface ListCarriersParams {
  activeOnly?: boolean;
}

export async function listCarriers(params: ListCarriersParams = {}) {
  const { activeOnly = false } = params;

  return prisma.carrier.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function getCarrierById(id: string) {
  return prisma.carrier.findUnique({ where: { id } });
}
