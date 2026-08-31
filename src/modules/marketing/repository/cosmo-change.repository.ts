import { prisma } from "@/lib/prisma";

export async function listChangesByPeriod(cosmoPeriodId: string) {
  return prisma.cosmoChange.findMany({
    where: { cosmoPeriodId },
    orderBy: { changeDate: "asc" },
  });
}

export async function getChangeById(id: string) {
  return prisma.cosmoChange.findUnique({
    where: { id },
    include: { cosmoPeriod: true },
  });
}
