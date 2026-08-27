import type { Prisma } from "@/generated/prisma/client";

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Forma mínima de cliente Prisma que esta función necesita: solo
 * `notification.createMany`. Permite pasar tanto `prisma` como el `tx` de un
 * `prisma.$transaction(...)`, para que la creación de notificaciones pueda
 * participar en la misma transacción que el cambio de estado, el historial y
 * el audit log (si algo falla, se revierte todo).
 */
export interface NotificationWriter {
  notification: {
    createMany: (args: {
      data: Prisma.NotificationCreateManyInput[];
    }) => Promise<{ count: number }>;
  };
}

export async function createNotifications(
  db: NotificationWriter,
  inputs: CreateNotificationInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  await db.notification.createMany({
    data: inputs.map((input) => ({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
}
