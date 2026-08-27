import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { renameMode } from "@/modules/modes/service/mode-crud.service";
import { modeNameSchema } from "@/modules/modes/validation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.VENDOR_MODES_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = modeNameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id } = await params;
  const headerList = await headers();
  const result = await renameMode(id, parsed.data.name, {
    userId: session.user.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    userAgent: headerList.get("user-agent"),
  });

  if (!result.ok) {
    const status = result.error === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, mode: result.mode });
}
