import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui";
import { VendorOrderForm } from "@/components/vendor";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { listCarriers } from "@/modules/carriers/repository/carrier.repository";
import { listModes } from "@/modules/modes/repository/mode.repository";
import { getVendorOrderById } from "@/modules/vendor/repository/vendor-order.repository";

interface EditVendorOrderPageProps {
  params: Promise<{ id: string }>;
}

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditVendorOrderPage({ params }: EditVendorOrderPageProps) {
  const { id } = await params;

  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const permissions = await getUserPermissions(session.user.id);
  if (!permissions.has(PERMISSIONS.VENDOR_ORDERS_EDIT)) {
    return <AccessDenied message="You do not have permission to edit vendor orders." />;
  }

  const order = await getVendorOrderById(id);
  if (!order) {
    notFound();
  }

  const [activeCarriers, activeModes] = await Promise.all([
    listCarriers({ activeOnly: true }),
    listModes({ activeOnly: true }),
  ]);

  // Si el carrier/mode actualmente asignado está inactivo, se agrega igual a
  // la lista para no perder la selección vigente al editar — solo se oculta
  // para NUEVAS selecciones (dropdown de creación, o al cambiar el valor).
  const carriers =
    order.carrier && !order.carrier.isActive ? [...activeCarriers, order.carrier] : activeCarriers;
  const modes = order.mode && !order.mode.isActive ? [...activeModes, order.mode] : activeModes;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-neutral-900">Edit Vendor Order — {order.orderNumber}</h1>
      <VendorOrderForm
        mode="edit"
        orderId={order.id}
        carriers={carriers}
        modes={modes}
        initialValues={{
          orderNumber: order.orderNumber,
          orderDate: toDateInputValue(order.orderDate),
          carrierId: order.carrierId ?? "",
          modeId: order.modeId ?? "",
          tracking: order.tracking ?? "",
          deliveryDate: toDateInputValue(order.deliveryDate),
          pickUpDate: toDateInputValue(order.pickUpDate),
          shipmentDate: toDateInputValue(order.shipmentDate),
          invoiceNumber: order.invoiceNumber === null ? "" : String(order.invoiceNumber),
          cartonLabels: order.cartonLabels,
          bol: order.bol,
          palletLabels: order.palletLabels,
          asn: order.asn,
          carrierLabels: order.carrierLabels,
          carrierLabelType: order.carrierLabelType,
          packingSlip: order.packingSlip,
        }}
      />
    </div>
  );
}
