import { prisma } from "@/lib/prisma";

export interface ListNotificationsParams {
  limit?: number;
}

/**
 * Todas las funciones de este repositorio están obligatoriamente filtradas
 * por `userId`. Un usuario nunca puede leer ni modificar notificaciones de
 * otro usuario, ni siquiera conociendo el id de la notificación.
 */
export async function listNotificationsForUser(userId: string, params: ListNotificationsParams = {}) {
  const { limit = 20 } = params;

  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * @returns true si la notificación existía y pertenecía al usuario (y quedó
 * marcada como leída); false si no existe o pertenece a otro usuario — en
 * ambos casos, sin distinguir el motivo hacia el llamador.
 */
export async function markNotificationAsRead(userId: string, notificationId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count > 0) return true;

  // Puede que ya estuviera leída (idempotente) o que no exista/no sea del usuario.
  const alreadyRead = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true },
  });

  return alreadyRead !== null;
}

export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return result.count;
}
