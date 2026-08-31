import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getProductById } from "@/modules/products/repository/product.repository";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product || !product.isActive) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">{product.sku}</h1>
        <Link href="/products/catalog">
          <Button variant="outline" size="sm">
            Back to Catalog
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-neutral-500">SKU</dt>
              <dd className="text-sm font-medium text-neutral-900">{product.sku}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">ASIN</dt>
              <dd className="text-sm font-medium text-neutral-900">{product.asin ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Item</dt>
              <dd className="text-sm font-medium text-neutral-900">{product.item}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Country</dt>
              <dd className="text-sm font-medium text-neutral-900">
                {product.country.length > 0 ? product.country.join(", ") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Link</dt>
              <dd className="text-sm font-medium text-neutral-900">
                {product.link ? (
                  <a
                    href={product.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    {product.link}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Case Of</dt>
              <dd className="text-sm font-medium text-neutral-900">{product.caseOf}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Cases Per Pallet</dt>
              <dd className="text-sm font-medium text-neutral-900">{product.casesPerPallet}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Unit of Measurement</dt>
              <dd className="text-sm font-medium text-neutral-900">{product.unitOfMeasurement}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Unit</dt>
              <dd className="text-sm font-medium text-neutral-900">{product.unit}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
