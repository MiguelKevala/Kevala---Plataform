import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import { markAllNotificationsAsRead } from "@/modules/notifications/repository/notification.repository";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const count = await markAllNotificationsAsRead(session.user.id);

  return NextResponse.json({ ok: true, count });
}
