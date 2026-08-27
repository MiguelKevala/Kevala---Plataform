import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import {
  countUnreadNotifications,
  listNotificationsForUser,
} from "@/modules/notifications/repository/notification.repository";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const [items, unreadCount] = await Promise.all([
    listNotificationsForUser(session.user.id, { limit }),
    countUnreadNotifications(session.user.id),
  ]);

  return NextResponse.json({ items, unreadCount });
}
