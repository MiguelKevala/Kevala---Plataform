import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logout } from "@/modules/auth/service";
import { SESSION_COOKIE_NAME } from "@/modules/auth/constants";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await logout(token);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);

  return NextResponse.json({ ok: true });
}
