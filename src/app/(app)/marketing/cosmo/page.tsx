import { CosmoWorkspace } from "@/components/marketing";
import { getCurrentSession } from "@/modules/auth/get-session";
import { listPeriodsByProduct } from "@/modules/marketing/repository/cosmo-period.repository";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { getProductById } from "@/modules/products/repository/product.repository";

interface CosmoPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CosmoPage({ searchParams }: CosmoPageProps) {
  const resolvedParams = await searchParams;
  const productId = firstValue(resolvedParams.productId);

  const session = await getCurrentSession();
  const canManage = session
    ? (await getUserPermissions(session.user.id)).has(PERMISSIONS.MARKETING_COSMO_MANAGE)
    : false;

  const product = productId ? await getProductById(productId) : null;
  const periodsRaw = product && product.isActive ? await listPeriodsByProduct(product.id) : [];

  const periods = periodsRaw.map((period) => ({
    id: period.id,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    unitsSold: period.unitsSold,
    unitsAvailable: period.unitsAvailable,
    changes: period.changes.map((change) => ({
      id: change.id,
      changeDate: change.changeDate.toISOString(),
      description: change.description,
      country: change.country,
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Cosmo - Algorithm</h1>
        <p className="text-sm text-neutral-500">
          Product tracking: periods, Units Sold, Units Available, and Changes.
        </p>
      </div>

      <CosmoWorkspace
        selectedProduct={
          product && product.isActive
            ? {
                id: product.id,
                sku: product.sku,
                item: product.item,
                asin: product.asin,
                country: product.country,
                link: product.link,
              }
            : null
        }
        periods={periods}
        canManage={canManage}
      />
    </div>
  );
}
