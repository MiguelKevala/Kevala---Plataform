"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Modal,
  Toast,
} from "@/components/ui";
import { formatDate } from "@/lib/format-date";

export interface ProductSearchResult {
  id: string;
  sku: string;
  item: string;
  asin: string | null;
  country: string[];
}

export interface CosmoProductInfo extends ProductSearchResult {
  link: string | null;
}

export interface CosmoChangeItem {
  id: string;
  changeDate: string;
  description: string;
  country: string[];
}

export interface CosmoPeriodItem {
  id: string;
  startDate: string;
  endDate: string;
  unitsSold: number;
  unitsAvailable: number;
  changes: CosmoChangeItem[];
}

export interface CosmoWorkspaceProps {
  selectedProduct: CosmoProductInfo | null;
  periods: CosmoPeriodItem[];
  canManage: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Please log in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "This record no longer exists.",
  PRODUCT_NOT_FOUND: "This product no longer exists.",
  NO_PERIOD: "No period exists for this date.",
  DUPLICATE_PERIOD: "A period with this exact Start Date and End Date already exists for this product.",
  DUPLICATE_CHANGE: "This exact change is already recorded for this date.",
  INVALID_MARKET: "One of the selected markets is not configured for this product in Catalog.",
  VALIDATION_ERROR: "Please review the highlighted fields.",
};

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/** Buscador de producto reutilizable: usado tanto por el selector principal
 * de la página como por el campo "Product" del modal Add Change (creación),
 * para no duplicar la lógica de búsqueda. */
function ProductSearchField({
  label = "Product",
  value,
  onSelect,
  helperText,
}: {
  label?: string;
  value: ProductSearchResult | null;
  onSelect: (product: ProductSearchResult) => void;
  helperText?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim() === "") {
      // No hay nada que buscar; el dropdown ya no se renderiza cuando la
      // búsqueda está vacía (ver más abajo), así que no hace falta limpiar
      // `results` aquí — evita un setState síncrono en el cuerpo del efecto.
      return;
    }

    let active = true;
    const timeout = setTimeout(() => {
      fetch(`/api/products?q=${encodeURIComponent(query.trim())}&pageSize=10`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!active || !data) return;
          setResults(data.items ?? []);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(product: ProductSearchResult) {
    setOpen(false);
    setQuery("");
    onSelect(product);
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        label={label}
        placeholder="Search by SKU, Item, or ASIN"
        value={query}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          setOpen(true);
          if (nextValue.trim() !== "") setSearching(true);
        }}
        onFocus={() => setOpen(true)}
        helperText={
          helperText ?? (value ? `Currently selected: ${value.sku} — ${value.item}` : "No product selected.")
        }
      />
      {open && query.trim() !== "" && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-lg">
          {searching ? (
            <p className="px-3 py-2 text-sm text-neutral-500">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-neutral-500">No products match your search.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(product)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium text-neutral-900">
                      {product.sku} — {product.item}
                    </span>
                    <span className="text-xs text-neutral-500">{product.asin ?? "No ASIN"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ProductPicker({ selectedProduct }: { selectedProduct: CosmoProductInfo | null }) {
  const router = useRouter();
  return (
    <div className="max-w-md">
      <ProductSearchField
        value={selectedProduct}
        onSelect={(product) => router.push(`/marketing/cosmo?productId=${product.id}`)}
      />
    </div>
  );
}

interface ImportSummary {
  productsProcessed: number;
  periodsImported: number;
  periodsUpdated: number;
  changesImported: number;
  productsNotFound: string[];
  invalidPeriods: Array<{ product: string; raw: string; error: string }>;
  invalidChanges: Array<{ product: string; line: string; reason: string }>;
  duplicateChangesSkipped: number;
  errors: Array<{ product: string; error: string }>;
}

function ImportExcelModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function handleImport() {
    if (!file) {
      setError("Please choose an Excel (.xlsx) file.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/marketing/cosmo/import", { method: "POST", body: formData });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(ERROR_MESSAGES[data?.error] ?? "Could not import this file.");
        return;
      }

      setSummary(data.summary);
      onImported();
    } finally {
      setSubmitting(false);
    }
  }

  const hasIssues =
    summary &&
    (summary.productsNotFound.length > 0 ||
      summary.invalidPeriods.length > 0 ||
      summary.invalidChanges.length > 0 ||
      summary.errors.length > 0);

  return (
    <Modal open onClose={onClose} title="Import Excel" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        {error && <Toast variant="danger" title={error} onDismiss={() => setError(null)} />}

        {!summary ? (
          <>
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <p className="text-sm text-neutral-500">
              Upload the Cosmo tracking Excel file as-is. No need to reorganize it first.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Toast
              variant={hasIssues ? "warning" : "success"}
              title={hasIssues ? "Import completed with warnings" : "Import completed successfully"}
            />
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-neutral-500">Products processed</dt>
                <dd className="font-medium text-neutral-900">{summary.productsProcessed}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Periods imported</dt>
                <dd className="font-medium text-neutral-900">{summary.periodsImported}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Periods updated</dt>
                <dd className="font-medium text-neutral-900">{summary.periodsUpdated}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Changes imported</dt>
                <dd className="font-medium text-neutral-900">{summary.changesImported}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Duplicates skipped</dt>
                <dd className="font-medium text-neutral-900">{summary.duplicateChangesSkipped}</dd>
              </div>
            </dl>

            {summary.productsNotFound.length > 0 && (
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  Products not found ({summary.productsNotFound.length}):
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-neutral-700">
                  {summary.productsNotFound.map((asin) => (
                    <li key={asin}>{asin}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.invalidPeriods.length > 0 && (
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  Invalid periods ({summary.invalidPeriods.length}):
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-neutral-700">
                  {summary.invalidPeriods.map((entry, index) => (
                    <li key={index}>
                      {entry.product}: {entry.error} ({entry.raw})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.invalidChanges.length > 0 && (
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  Invalid changes ({summary.invalidChanges.length}):
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-neutral-700">
                  {summary.invalidChanges.map((entry, index) => (
                    <li key={index}>
                      {entry.product}: &ldquo;{entry.line}&rdquo; — {entry.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-neutral-900">Errors ({summary.errors.length}):</p>
                <ul className="mt-1 list-inside list-disc text-sm text-red-700">
                  {summary.errors.map((entry, index) => (
                    <li key={index}>
                      {entry.product}: {entry.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          {summary ? "Close" : "Cancel"}
        </Button>
        {!summary && (
          <Button size="sm" onClick={handleImport} disabled={submitting}>
            {submitting ? "Importing..." : "Import"}
          </Button>
        )}
      </div>
    </Modal>
  );
}

interface ChangeFormValues {
  changeDate: string;
  description: string;
  country: string[];
}

function AddOrEditChangeModal({
  mode,
  initialProduct,
  editingChange,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initialProduct: ProductSearchResult | null;
  editingChange: CosmoChangeItem | null;
  onClose: () => void;
  onSaved: (productId: string) => void;
}) {
  const [product, setProduct] = useState<ProductSearchResult | null>(initialProduct);
  const [values, setValues] = useState<ChangeFormValues>({
    changeDate: editingChange ? toDateInputValue(editingChange.changeDate) : "",
    description: editingChange?.description ?? "",
    country: editingChange?.country ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const availableMarkets = product?.country ?? [];

  function toggleMarket(market: string, checked: boolean) {
    setValues((previous) => ({
      ...previous,
      country: checked ? [...previous.country, market] : previous.country.filter((value) => value !== market),
    }));
  }

  function selectProduct(nextProduct: ProductSearchResult) {
    setProduct(nextProduct);
    // Si el producto cambia, se descarta cualquier mercado ya elegido que no
    // pertenezca a los mercados configurados del nuevo producto.
    setValues((previous) => ({
      ...previous,
      country: previous.country.filter((market) => nextProduct.country.includes(market)),
    }));
  }

  async function handleSubmit() {
    if (!product) {
      setError("Select a product.");
      return;
    }
    if (values.changeDate.trim() === "" || values.description.trim() === "") {
      setError("Date and Description are both required.");
      return;
    }
    if (values.country.length === 0) {
      setError("Select at least one market.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const url = editingChange ? `/api/marketing/cosmo/changes/${editingChange.id}` : "/api/marketing/cosmo/changes";
      const method = editingChange ? "PATCH" : "POST";
      const payload = editingChange
        ? { changeDate: values.changeDate, description: values.description.trim(), country: values.country }
        : {
            productId: product.id,
            changeDate: values.changeDate,
            description: values.description.trim(),
            country: values.country,
          };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(ERROR_MESSAGES[data?.error] ?? "Could not save this change.");
        return;
      }

      onSaved(product.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? "Edit Change" : "Add Change"}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Toast variant="danger" title={error} onDismiss={() => setError(null)} />}

        {mode === "create" ? (
          <ProductSearchField value={product} onSelect={selectProduct} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-800">Product</span>
            <p className="text-sm text-neutral-700">
              {product?.sku} — {product?.item}
            </p>
          </div>
        )}

        <Input
          label="Date"
          type="date"
          required
          value={values.changeDate}
          onChange={(event) => setValues((previous) => ({ ...previous, changeDate: event.target.value }))}
        />

        {!product ? null : availableMarkets.length === 0 ? (
          <p className="text-sm text-red-600">
            This product has no markets configured in Catalog. Add at least one market (USA, Mexico, or
            Canada) to this product before recording a Change.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-800">Markets</span>
            <div className="flex flex-wrap gap-4">
              {availableMarkets.map((market) => (
                <Checkbox
                  key={market}
                  label={market}
                  checked={values.country.includes(market)}
                  onChange={(event) => toggleMarket(market, event.target.checked)}
                />
              ))}
            </div>
            <p className="text-sm text-neutral-500">Only markets configured for this product in Catalog.</p>
          </div>
        )}

        <Input
          label="Description"
          required
          value={values.description}
          onChange={(event) => setValues((previous) => ({ ...previous, description: event.target.value }))}
          placeholder="Title and bullets changed"
        />
        <p className="text-sm text-neutral-500">The period is determined automatically from the Date.</p>
      </div>
    </Modal>
  );
}

function DeleteChangeModal({
  change,
  onClose,
  onDeleted,
}: {
  change: CosmoChangeItem;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketing/cosmo/changes/${change.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(ERROR_MESSAGES[data?.error] ?? "Could not delete this change.");
        return;
      }

      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (deleting ? undefined : onClose())}
      title="Delete Change"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </>
      }
    >
      {error && <Toast variant="danger" title={error} onDismiss={() => setError(null)} />}
      <p className="text-sm text-neutral-700">
        Are you sure you want to delete the Change on <strong>{formatDate(change.changeDate)}</strong> —{" "}
        {change.description}? This action cannot be undone.
      </p>
    </Modal>
  );
}

interface PeriodFormValues {
  startDate: string;
  endDate: string;
  unitsSold: string;
  unitsAvailable: string;
}

function EditPeriodModal({
  period,
  onClose,
  onSaved,
}: {
  period: CosmoPeriodItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<PeriodFormValues>({
    startDate: toDateInputValue(period.startDate),
    endDate: toDateInputValue(period.endDate),
    unitsSold: String(period.unitsSold),
    unitsAvailable: String(period.unitsAvailable),
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const unitsSold = Number(values.unitsSold);
    const unitsAvailable = Number(values.unitsAvailable);
    if (
      values.startDate.trim() === "" ||
      values.endDate.trim() === "" ||
      values.unitsSold.trim() === "" ||
      values.unitsAvailable.trim() === "" ||
      !Number.isInteger(unitsSold) ||
      unitsSold < 0 ||
      !Number.isInteger(unitsAvailable) ||
      unitsAvailable < 0
    ) {
      setError("Please provide valid Start Date, End Date, Units Sold, and Units Available.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketing/cosmo/periods/${period.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: values.startDate,
          endDate: values.endDate,
          unitsSold,
          unitsAvailable,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(ERROR_MESSAGES[data?.error] ?? "Could not save this period.");
        return;
      }

      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Period"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Toast variant="danger" title={error} onDismiss={() => setError(null)} />}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start Date"
            type="date"
            required
            value={values.startDate}
            onChange={(event) => setValues((previous) => ({ ...previous, startDate: event.target.value }))}
          />
          <Input
            label="End Date"
            type="date"
            required
            value={values.endDate}
            onChange={(event) => setValues((previous) => ({ ...previous, endDate: event.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Units Sold"
            type="number"
            min={0}
            step={1}
            required
            value={values.unitsSold}
            onChange={(event) => setValues((previous) => ({ ...previous, unitsSold: event.target.value }))}
          />
          <Input
            label="Units Available"
            type="number"
            min={0}
            step={1}
            required
            value={values.unitsAvailable}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, unitsAvailable: event.target.value }))
            }
          />
        </div>
      </div>
    </Modal>
  );
}

export function CosmoWorkspace({ selectedProduct, periods, canManage }: CosmoWorkspaceProps) {
  const router = useRouter();
  // `selectedPeriodId` solo se toca cuando el usuario navega explícitamente
  // (Previous/Next). Si periods cambia (nuevo producto, refresh tras una
  // mutación) y ese id ya no existe en la lista, se cae al periodo más
  // reciente — derivado directamente en el render, sin useEffect, para no
  // encadenar un setState síncrono cuando cambian las props.
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddChangeModal, setShowAddChangeModal] = useState(false);
  const [editingChange, setEditingChange] = useState<CosmoChangeItem | null>(null);
  const [deletingChange, setDeletingChange] = useState<CosmoChangeItem | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<CosmoPeriodItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const latestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? latestPeriod;
  const selectedIndex = selectedPeriod
    ? periods.findIndex((period) => period.id === selectedPeriod.id)
    : -1;

  /** Cierra cualquier modal abierto y refresca los datos del servidor. Si el
   * Change afectado pertenece a un producto distinto al que se está viendo
   * actualmente (o no había ninguno seleccionado todavía), navega a ese
   * producto para que el resultado "aparezca inmediatamente en Cosmo" tal
   * como pide la especificación, en vez de quedar invisible en la vista
   * actual. */
  function refresh(message: string, productId?: string) {
    setShowAddChangeModal(false);
    setEditingChange(null);
    setDeletingChange(null);
    setEditingPeriod(null);
    setNotice(message);
    if (productId && productId !== selectedProduct?.id) {
      router.push(`/marketing/cosmo?productId=${productId}`);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {notice && <Toast variant="success" title={notice} onDismiss={() => setNotice(null)} />}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <ProductPicker selectedProduct={selectedProduct} />
        <div className="flex gap-3">
          {canManage && <Button onClick={() => setShowAddChangeModal(true)}>Add Change</Button>}
          {canManage && (
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              Import Excel
            </Button>
          )}
        </div>
      </div>

      {!selectedProduct ? (
        <p className="text-sm text-neutral-500">Select a product above to view its Cosmo data.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Product</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-neutral-500">Product Name</dt>
                  <dd className="text-sm font-medium text-neutral-900">{selectedProduct.item}</dd>
                </div>
                <div>
                  <dt className="text-sm text-neutral-500">ASIN</dt>
                  <dd className="text-sm font-medium text-neutral-900">{selectedProduct.asin ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-neutral-500">Country</dt>
                  <dd className="text-sm font-medium text-neutral-900">
                    {selectedProduct.country.length > 0 ? selectedProduct.country.join(", ") : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-neutral-500">Link</dt>
                  <dd className="text-sm font-medium text-neutral-900">
                    {selectedProduct.link ? (
                      <a
                        href={selectedProduct.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 hover:underline"
                      >
                        {selectedProduct.link}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {periods.length === 0 ? (
            <p className="text-sm text-neutral-500">No periods yet for this product.</p>
          ) : (
            selectedPeriod && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Period</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={selectedIndex <= 0}
                        onClick={() => setSelectedPeriodId(periods[selectedIndex - 1].id)}
                      >
                        Previous
                      </Button>
                      <Badge>
                        {selectedIndex + 1} / {periods.length}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={selectedIndex >= periods.length - 1}
                        onClick={() => setSelectedPeriodId(periods[selectedIndex + 1].id)}
                      >
                        Next
                      </Button>
                      {canManage && (
                        <Button variant="outline" size="sm" onClick={() => setEditingPeriod(selectedPeriod)}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <div>
                      <dt className="text-sm text-neutral-500">Start Date</dt>
                      <dd className="text-sm font-medium text-neutral-900">
                        {formatDate(selectedPeriod.startDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-neutral-500">End Date</dt>
                      <dd className="text-sm font-medium text-neutral-900">
                        {formatDate(selectedPeriod.endDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-neutral-500">Units Sold</dt>
                      <dd className="text-sm font-medium text-neutral-900">{selectedPeriod.unitsSold}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-neutral-500">Units Available</dt>
                      <dd className="text-sm font-medium text-neutral-900">
                        {selectedPeriod.unitsAvailable}
                      </dd>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-neutral-900">Changes</h3>
                    {selectedPeriod.changes.length === 0 ? (
                      <p className="text-sm text-neutral-500">No changes recorded for this period.</p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {selectedPeriod.changes.map((change) => (
                          <li
                            key={change.id}
                            className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-neutral-900">
                                  {formatDate(change.changeDate)}
                                </p>
                                <div className="flex gap-1">
                                  {change.country.map((market) => (
                                    <Badge key={market} variant="info">
                                      {market}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <p className="text-sm text-neutral-700">{change.description}</p>
                            </div>
                            {canManage && (
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setEditingChange(change)}>
                                  Edit
                                </Button>
                                <Button variant="danger" size="sm" onClick={() => setDeletingChange(change)}>
                                  Delete
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </>
      )}

      {showImportModal && (
        <ImportExcelModal
          onClose={() => setShowImportModal(false)}
          onImported={() => router.refresh()}
        />
      )}

      {showAddChangeModal && (
        <AddOrEditChangeModal
          mode="create"
          initialProduct={selectedProduct}
          editingChange={null}
          onClose={() => setShowAddChangeModal(false)}
          onSaved={(productId) => refresh("Change created successfully.", productId)}
        />
      )}

      {editingChange && selectedProduct && (
        <AddOrEditChangeModal
          mode="edit"
          initialProduct={selectedProduct}
          editingChange={editingChange}
          onClose={() => setEditingChange(null)}
          onSaved={() => refresh("Change updated successfully.")}
        />
      )}

      {deletingChange && (
        <DeleteChangeModal
          change={deletingChange}
          onClose={() => setDeletingChange(null)}
          onDeleted={() => refresh("Change deleted successfully.")}
        />
      )}

      {editingPeriod && (
        <EditPeriodModal
          period={editingPeriod}
          onClose={() => setEditingPeriod(null)}
          onSaved={() => refresh("Period updated successfully.")}
        />
      )}
    </div>
  );
}
