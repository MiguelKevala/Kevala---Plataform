import { prisma } from "@/lib/prisma";

export interface ListModesParams {
  activeOnly?: boolean;
}

export async function listModes(params: ListModesParams = {}) {
  const { activeOnly = false } = params;

  return prisma.mode.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function getModeById(id: string) {
  return prisma.mode.findUnique({ where: { id } });
}
