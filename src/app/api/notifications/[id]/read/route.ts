import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import { markNotificationAsRead } from "@/modules/notifications/repository/notification.repository";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  const found = await markNotificationAsRead(session.user.id, id);

  if (!found) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
