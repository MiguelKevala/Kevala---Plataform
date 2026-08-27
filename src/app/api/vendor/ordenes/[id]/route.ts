import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { editVendorOrder } from "@/modules/vendor/services/vendor-order-crud.service";
import { editVendorOrderSchema } from "@/modules/vendor/validation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const CATALOG_ERROR_STATUS: Record<string, number> = {
  CARRIER_NOT_FOUND: 400,
  INACTIVE_CARRIER: 400,
  MODE_NOT_FOUND: 400,
  INACTIVE_MODE: 400,
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.VENDOR_ORDERS_EDIT)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = editVendorOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id } = await params;
  const headerList = await headers();
  const result = await editVendorOrder(
    id,
    {
      orderDate: parsed.data.orderDate,
      confirmationDeadline: parsed.data.confirmationDeadline ?? null,
      deliveryDeadline: parsed.data.deliveryDeadline ?? null,
      carrierId: parsed.data.carrierId,
      modeId: parsed.data.modeId,
      invoiceNumber: parsed.data.invoiceNumber ?? null,
      cartonLabels: parsed.data.cartonLabels,
      bol: parsed.data.bol,
      palletLabels: parsed.data.palletLabels,
      upsLabels: parsed.data.upsLabels,
      ontracLabels: parsed.data.ontracLabels,
      amzx: parsed.data.amzx,
      asn: parsed.data.asn,
    },
    {
      userId: session.user.id,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      userAgent: headerList.get("user-agent"),
    },
  );

  if (!result.ok) {
    if (result.error === "NOT_FOUND") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ error: result.error }, { status: CATALOG_ERROR_STATUS[result.error] });
  }

  return NextResponse.json({ ok: true, order: result.order });
}
