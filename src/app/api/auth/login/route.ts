import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { login } from "@/modules/auth/service";
import { SESSION_COOKIE_NAME } from "@/modules/auth/constants";
import { loginSchema } from "@/modules/auth/validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const headerList = await headers();
  const result = await login(parsed.data.email, parsed.data.password, {
    userAgent: headerList.get("user-agent"),
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });

  return NextResponse.json({ ok: true });
}
