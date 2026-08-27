import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { listCarriers } from "@/modules/carriers/repository/carrier.repository";
import { createCarrier } from "@/modules/carriers/service/carrier-crud.service";
import { carrierNameSchema } from "@/modules/carriers/validation";

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.id);
  const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";

  const canReadForOrders =
    permissions.has(PERMISSIONS.VENDOR_ORDERS_CREATE) || permissions.has(PERMISSIONS.VENDOR_ORDERS_EDIT);
  const canManage = permissions.has(PERMISSIONS.VENDOR_CARRIERS_MANAGE);

  if (activeOnly ? !canReadForOrders && !canManage : !canManage) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const items = await listCarriers({ activeOnly });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.VENDOR_CARRIERS_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = carrierNameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const headerList = await headers();
  const result = await createCarrier(parsed.data.name, {
    userId: session.user.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    userAgent: headerList.get("user-agent"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true, carrier: result.carrier });
}
