import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { importCosmoExcel } from "@/modules/marketing/importer/cosmo-import.service";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB — margen amplio para 100+ productos.

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.MARKETING_COSMO_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: { file: ["An Excel file is required."] } },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: { file: ["The file is empty."] } },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: { file: ["The file is too large."] } },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const headerList = await headers();
  try {
    const summary = await importCosmoExcel(buffer, {
      userId: session.user.id,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      userAgent: headerList.get("user-agent"),
    });

    return NextResponse.json({ ok: true, summary });
  } catch {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: { file: ["Could not read this file. Make sure it is a valid Excel (.xlsx) file."] } },
      { status: 400 },
    );
  }
}
