import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessDenied, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const permissions = await getUserPermissions(session.user.id);
  const canManageCarriers = permissions.has(PERMISSIONS.VENDOR_CARRIERS_MANAGE);
  const canManageModes = permissions.has(PERMISSIONS.VENDOR_MODES_MANAGE);

  if (!canManageCarriers && !canManageModes) {
    return <AccessDenied message="You do not have permission to access Settings." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-neutral-900">Settings</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {canManageCarriers && (
          <Link href="/settings/carriers">
            <Card>
              <CardHeader>
                <CardTitle>Carriers</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-500">Manage carrier catalog records.</p>
              </CardContent>
            </Card>
          </Link>
        )}
        {canManageModes && (
          <Link href="/settings/modes">
            <Card>
              <CardHeader>
                <CardTitle>Modes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-500">Manage shipping mode catalog records.</p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
