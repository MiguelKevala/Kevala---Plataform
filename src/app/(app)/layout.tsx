import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";

export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  const permissions = await getUserPermissions(session.user.id);

  return (
    <AppShell
      userName={session.user.name}
      canManageCarriers={permissions.has(PERMISSIONS.VENDOR_CARRIERS_MANAGE)}
      canManageModes={permissions.has(PERMISSIONS.VENDOR_MODES_MANAGE)}
      canViewProducts={permissions.has(PERMISSIONS.PRODUCTS_VIEW)}
      canViewMarketingCosmo={permissions.has(PERMISSIONS.MARKETING_COSMO_VIEW)}
    >
      {children}
    </AppShell>
  );
}
