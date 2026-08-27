import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { createVendorOrder } from "@/modules/vendor/services/vendor-order-crud.service";
import { createVendorOrderSchema } from "@/modules/vendor/validation";

const CATALOG_ERROR_STATUS: Record<string, number> = {
  CARRIER_NOT_FOUND: 400,
  INACTIVE_CARRIER: 400,
  MODE_NOT_FOUND: 400,
  INACTIVE_MODE: 400,
};

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.VENDOR_ORDERS_CREATE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createVendorOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const headerList = await headers();
  const result = await createVendorOrder(
    {
      orderNumber: parsed.data.orderNumber,
      orderDate: parsed.data.orderDate,
      carrierId: parsed.data.carrierId ?? null,
      modeId: parsed.data.modeId ?? null,
      tracking: parsed.data.tracking ?? null,
      deliveryDate: parsed.data.deliveryDate ?? null,
      pickUpDate: parsed.data.pickUpDate ?? null,
      shipmentDate: parsed.data.shipmentDate ?? null,
      invoiceNumber: parsed.data.invoiceNumber ?? null,
      cartonLabels: parsed.data.cartonLabels ?? null,
      bol: parsed.data.bol ?? null,
      palletLabels: parsed.data.palletLabels ?? null,
      asn: parsed.data.asn ?? null,
      carrierLabels: parsed.data.carrierLabels ?? null,
      carrierLabelType: parsed.data.carrierLabelType ?? null,
      packingSlip: parsed.data.packingSlip ?? null,
    },
    {
      userId: session.user.id,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      userAgent: headerList.get("user-agent"),
    },
  );

  if (!result.ok) {
    if (result.error === "DUPLICATE_ORDER_NUMBER") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    if (result.error === "CHECKLIST_INVALID") {
      return NextResponse.json({ error: result.error, issues: result.issues }, { status: 400 });
    }
    return NextResponse.json({ error: result.error }, { status: CATALOG_ERROR_STATUS[result.error] });
  }

  return NextResponse.json({ ok: true, order: result.order });
}
