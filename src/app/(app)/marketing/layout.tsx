import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.MARKETING_COSMO_VIEW)) {
    return <AccessDenied message="You do not have access to the Marketing module." />;
  }

  return <>{children}</>;
}
