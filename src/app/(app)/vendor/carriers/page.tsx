import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui";
import { CatalogAdminTable } from "@/components/vendor";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";

export default async function CarriersPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.VENDOR_CARRIERS_MANAGE)) {
    return <AccessDenied message="You do not have permission to manage carriers." />;
  }

  return (
    <CatalogAdminTable resourceName="Carrier" resourceNamePlural="Carriers" apiBasePath="/api/carriers" />
  );
}
