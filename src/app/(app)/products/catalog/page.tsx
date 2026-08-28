import { Input, Button } from "@/components/ui";
import { ProductCatalogTable } from "@/components/products";
import { getCurrentSession } from "@/modules/auth/get-session";
import { getUserPermissions } from "@/modules/rbac/get-user-permissions";
import { PERMISSIONS } from "@/modules/rbac/permissions";
import { listProducts } from "@/modules/products/repository/product.repository";

const PAGE_SIZE = 20;

interface ProductsCatalogPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsCatalogPage({ searchParams }: ProductsCatalogPageProps) {
  const resolvedParams = await searchParams;
  const search = firstValue(resolvedParams.q);
  const page = Math.max(1, Number(firstValue(resolvedParams.page)) || 1);

  const session = await getCurrentSession();
  const canManage = session
    ? (await getUserPermissions(session.user.id)).has(PERMISSIONS.PRODUCTS_MANAGE)
    : false;

  const { items, total } = await listProducts({ search, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Solo se envían al cliente los campos que la tabla realmente muestra —
  // id interno, isActive, createdAt y updatedAt nunca se exponen en la UI.
  const tableItems = items.map((product) => ({
    id: product.id,
    sku: product.sku,
    item: product.item,
    asin: product.asin,
    caseOf: product.caseOf,
    casesPerPallet: product.casesPerPallet,
    unitOfMeasurement: product.unitOfMeasurement,
    unit: product.unit,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Catalog</h1>
          <p className="text-sm text-neutral-500">Master product catalog.</p>
        </div>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <Input label="Search by SKU or Item" name="q" defaultValue={search} placeholder="SKU001" />
        <Button type="submit">Search</Button>
      </form>

      <ProductCatalogTable
        items={tableItems}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        canManage={canManage}
      />
    </div>
  );
}
