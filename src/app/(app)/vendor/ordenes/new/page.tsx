import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui";
import { VendorOrderForm } from "@/components/vendor";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { listCarriers } from "@/modules/carriers/repository/carrier.repository";
import { listModes } from "@/modules/modes/repository/mode.repository";

export default async function NewVendorOrderPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.VENDOR_ORDERS_CREATE)) {
    return <AccessDenied message="You do not have permission to create vendor orders." />;
  }

  const [carriers, modes] = await Promise.all([
    listCarriers({ activeOnly: true }),
    listModes({ activeOnly: true }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-neutral-900">New Vendor Order</h1>
      <VendorOrderForm
        mode="create"
        carriers={carriers}
        modes={modes}
        initialValues={{
          orderNumber: "",
          orderDate: new Date().toISOString().slice(0, 10),
          carrierId: "",
          modeId: "",
          tracking: "",
          deliveryDate: "",
          pickUpDate: "",
          shipmentDate: "",
          invoiceNumber: "",
          cartonLabels: null,
          bol: null,
          palletLabels: null,
          asn: null,
          carrierLabels: null,
          carrierLabelType: null,
          packingSlip: null,
        }}
      />
    </div>
  );
}
