import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { createCosmoChange } from "@/modules/marketing/service/cosmo-change-crud.service";
import { createCosmoChangeSchema } from "@/modules/marketing/validation";

const ERROR_STATUS: Record<string, number> = {
  PRODUCT_NOT_FOUND: 400,
  INVALID_MARKET: 400,
  NO_PERIOD: 409,
  DUPLICATE_CHANGE: 409,
};

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.MARKETING_COSMO_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createCosmoChangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const headerList = await headers();
  const result = await createCosmoChange(parsed.data, {
    userId: session.user.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    userAgent: headerList.get("user-agent"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: ERROR_STATUS[result.error] ?? 400 });
  }

  return NextResponse.json({ ok: true, change: result.change });
}
