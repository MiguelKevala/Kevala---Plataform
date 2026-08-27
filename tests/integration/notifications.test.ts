import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/modules/notifications/repository/notification.repository";

const EMAIL_PREFIX = "notif-repo-test";

let userA: { id: string };
let userB: { id: string };

async function createUser(suffix: string) {
  return prisma.user.create({
    data: {
      email: `${EMAIL_PREFIX}-${suffix}@kevala.test`,
      passwordHash: "not-a-real-hash",
      name: `Notif Repo Test ${suffix}`,
    },
  });
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

describe("Notification repository (Fase 7)", () => {
  beforeAll(async () => {
    await cleanup();
    userA = await createUser("a");
    userB = await createUser("b");
  });

  afterAll(cleanup);

  it("listForUser y countUnread solo devuelven notificaciones propias (aislamiento)", async () => {
    await prisma.notification.createMany({
      data: [
        { userId: userA.id, type: "TEST", title: "A1", message: "msg" },
        { userId: userA.id, type: "TEST", title: "A2", message: "msg" },
        { userId: userB.id, type: "TEST", title: "B1", message: "msg" },
      ],
    });

    const listA = await listNotificationsForUser(userA.id);
    const listB = await listNotificationsForUser(userB.id);

    expect(listA.map((n) => n.title).sort()).toEqual(["A1", "A2"]);
    expect(listB.map((n) => n.title)).toEqual(["B1"]);

    expect(await countUnreadNotifications(userA.id)).toBe(2);
    expect(await countUnreadNotifications(userB.id)).toBe(1);
  });

  it("respeta el límite pasado a listForUser", async () => {
    const list = await listNotificationsForUser(userA.id, { limit: 1 });
    expect(list).toHaveLength(1);
  });

  it("markNotificationAsRead: marca una notificación propia y devuelve true", async () => {
    const notification = await prisma.notification.create({
      data: { userId: userA.id, type: "TEST", title: "Read me", message: "msg" },
    });

    const result = await markNotificationAsRead(userA.id, notification.id);
    expect(result).toBe(true);

    const updated = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(updated.readAt).not.toBeNull();
  });

  it("markNotificationAsRead: es idempotente sobre una ya leída", async () => {
    const notification = await prisma.notification.create({
      data: { userId: userA.id, type: "TEST", title: "Already read", message: "msg", readAt: new Date() },
    });

    const result = await markNotificationAsRead(userA.id, notification.id);
    expect(result).toBe(true);
  });

  it("markNotificationAsRead: NO permite marcar una notificación de otro usuario manipulando el id", async () => {
    const notification = await prisma.notification.create({
      data: { userId: userB.id, type: "TEST", title: "Not yours", message: "msg" },
    });

    const result = await markNotificationAsRead(userA.id, notification.id);
    expect(result).toBe(false);

    const untouched = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(untouched.readAt).toBeNull();
  });

  it("markNotificationAsRead: devuelve false para un id inexistente", async () => {
    const result = await markNotificationAsRead(userA.id, "does-not-exist");
    expect(result).toBe(false);
  });

  it("markAllNotificationsAsRead: marca solo las propias no leídas y devuelve el conteo", async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.notification.createMany({
      data: [
        { userId: userA.id, type: "TEST", title: "A1", message: "msg" },
        { userId: userA.id, type: "TEST", title: "A2", message: "msg" },
        { userId: userB.id, type: "TEST", title: "B1", message: "msg" },
      ],
    });

    const count = await markAllNotificationsAsRead(userA.id);
    expect(count).toBe(2);

    expect(await countUnreadNotifications(userA.id)).toBe(0);
    expect(await countUnreadNotifications(userB.id)).toBe(1);
  });
});
