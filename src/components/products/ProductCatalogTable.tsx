"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toast,
} from "@/components/ui";
import {
  COUNTRY_VALUES,
  UNIT_OF_MEASUREMENT_VALUES,
  type CountryValue,
  type UnitOfMeasurementValue,
} from "@/modules/products/validation";

export interface ProductListItem {
  id: string;
  sku: string;
  item: string;
  asin: string | null;
  caseOf: number;
  casesPerPallet: number;
  unitOfMeasurement: UnitOfMeasurementValue;
  unit: number;
  country: CountryValue[];
  link: string | null;
}

export interface ProductCatalogTableProps {
  items: ProductListItem[];
  total: number;
  page: number;
  totalPages: number;
  search?: string;
  canManage: boolean;
}

interface FormValues {
  sku: string;
  item: string;
  asin: string;
  caseOf: string;
  casesPerPallet: string;
  unitOfMeasurement: UnitOfMeasurementValue | "";
  unit: string;
  country: CountryValue[];
  link: string;
}

const EMPTY_FORM: FormValues = {
  sku: "",
  item: "",
  asin: "",
  caseOf: "",
  casesPerPallet: "",
  unitOfMeasurement: "",
  unit: "",
  country: [],
  link: "",
};

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Please log in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "This product no longer exists.",
  DUPLICATE_SKU: "This SKU already exists. Please use a different SKU.",
  DUPLICATE_ASIN: "This ASIN is already registered. Please use a different ASIN.",
  VALIDATION_ERROR: "Please review the highlighted fields.",
};

type ModalState = { mode: "create" } | { mode: "edit"; product: ProductListItem } | null;

function buildPageHref(search: string | undefined, page: number): string {
  const query = new URLSearchParams();
  if (search) query.set("q", search);
  query.set("page", String(page));
  return `/products/catalog?${query.toString()}`;
}

function toFormValues(product: ProductListItem): FormValues {
  return {
    sku: product.sku,
    item: product.item,
    asin: product.asin ?? "",
    caseOf: String(product.caseOf),
    casesPerPallet: String(product.casesPerPallet),
    unitOfMeasurement: product.unitOfMeasurement,
    unit: String(product.unit),
    country: product.country,
    link: product.link ?? "",
  };
}

export function ProductCatalogTable({
  items,
  total,
  page,
  totalPages,
  search,
  canManage,
}: ProductCatalogTableProps) {
  const router = useRouter();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ variant: "success" | "danger"; message: string } | null>(null);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function toggleCountry(country: CountryValue, checked: boolean) {
    setValues((previous) => ({
      ...previous,
      country: checked
        ? [...previous.country, country]
        : previous.country.filter((value) => value !== country),
    }));
  }

  function openCreateModal() {
    setValues(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setModalState({ mode: "create" });
  }

  function openEditModal(product: ProductListItem) {
    setValues(toFormValues(product));
    setFieldErrors({});
    setFormError(null);
    setModalState({ mode: "edit", product });
  }

  function closeModal() {
    if (submitting) return;
    setModalState(null);
  }

  function validateFrontend(): Record<string, string[]> | null {
    const errors: Record<string, string[]> = {};

    if (values.sku.trim() === "") errors.sku = ["SKU is required."];
    else if (!/^[A-Za-z0-9]+$/.test(values.sku.trim())) {
      errors.sku = ["SKU may only contain letters and numbers."];
    }

    if (values.item.trim() === "") errors.item = ["Item is required."];

    if (values.asin.trim() === "") errors.asin = ["ASIN is required."];
    else if (!/^[A-Za-z0-9]+$/.test(values.asin.trim())) {
      errors.asin = ["ASIN may only contain letters and numbers."];
    }

    const caseOf = Number(values.caseOf);
    if (values.caseOf.trim() === "" || !Number.isInteger(caseOf) || caseOf <= 0) {
      errors.caseOf = ["Case Of must be a whole number greater than 0."];
    }

    const casesPerPallet = Number(values.casesPerPallet);
    if (values.casesPerPallet.trim() === "" || !Number.isInteger(casesPerPallet) || casesPerPallet <= 0) {
      errors.casesPerPallet = ["Cases Per Pallet must be a whole number greater than 0."];
    }

    if (values.unitOfMeasurement === "") errors.unitOfMeasurement = ["Unit of Measurement is required."];

    const unit = Number(values.unit);
    if (values.unit.trim() === "" || !Number.isFinite(unit) || unit <= 0) {
      errors.unit = ["Unit must be a number greater than 0."];
    }

    if (values.link.trim() !== "" && !/^https?:\/\/.+/i.test(values.link.trim())) {
      errors.link = ["Link must be a valid URL."];
    }

    return Object.keys(errors).length > 0 ? errors : null;
  }

  async function handleSubmit() {
    setFormError(null);
    setFieldErrors({});

    const frontendErrors = validateFrontend();
    if (frontendErrors) {
      setFieldErrors(frontendErrors);
      setFormError(ERROR_MESSAGES.VALIDATION_ERROR);
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        sku: values.sku.trim(),
        item: values.item.trim(),
        asin: values.asin.trim(),
        caseOf: Number(values.caseOf),
        casesPerPallet: Number(values.casesPerPallet),
        unitOfMeasurement: values.unitOfMeasurement,
        unit: Number(values.unit),
        country: values.country,
        link: values.link.trim() === "" ? null : values.link.trim(),
      };

      const isEdit = modalState?.mode === "edit";
      const url = isEdit ? `/api/products/${modalState.product.id}` : "/api/products";
      const method = isEdit ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (data?.error === "DUPLICATE_SKU") {
          setFieldErrors({ sku: [ERROR_MESSAGES.DUPLICATE_SKU] });
        } else if (data?.error === "DUPLICATE_ASIN") {
          setFieldErrors({ asin: [ERROR_MESSAGES.DUPLICATE_ASIN] });
        } else {
          setFieldErrors(data?.issues ?? {});
        }
        setFormError(ERROR_MESSAGES[data?.error] ?? "Could not save this product.");
        return;
      }

      setModalState(null);
      setNotice({
        variant: "success",
        message: isEdit ? "Product updated successfully." : "Product created successfully.",
      });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/products/${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setNotice({
          variant: "danger",
          message: ERROR_MESSAGES[data?.error] ?? "Could not delete this product.",
        });
        return;
      }

      setDeleteTarget(null);
      setNotice({ variant: "success", message: "Product deleted successfully." });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Toast
          variant={notice.variant}
          title={notice.message}
          onDismiss={() => setNotice(null)}
        />
      )}

      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openCreateModal}>Add Product</Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {total === 0 && !search ? "No products yet." : "No products match your search."}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>ASIN</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Case Of</TableHead>
                <TableHead>Cases Per Pallet</TableHead>
                <TableHead>Unit of Measurement</TableHead>
                <TableHead>Unit</TableHead>
                {canManage && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium text-neutral-900">
                    <Link href={`/products/catalog/${product.id}`} className="text-brand-700 hover:underline">
                      {product.sku}
                    </Link>
                  </TableCell>
                  <TableCell>{product.item}</TableCell>
                  <TableCell>{product.asin ?? "—"}</TableCell>
                  <TableCell>{product.country.length > 0 ? product.country.join(", ") : "—"}</TableCell>
                  <TableCell>{product.caseOf}</TableCell>
                  <TableCell>{product.casesPerPallet}</TableCell>
                  <TableCell>{product.unitOfMeasurement}</TableCell>
                  <TableCell>{product.unit}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditModal(product)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setDeleteTarget(product)}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>
              Page {page} of {totalPages} — {total} product{total === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={buildPageHref(search, page - 1)}>
                  <Button variant="outline" size="sm">
                    Previous
                  </Button>
                </Link>
              )}
              {page < totalPages && (
                <Link href={buildPageHref(search, page + 1)}>
                  <Button variant="outline" size="sm">
                    Next
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </>
      )}

      <Modal
        open={modalState !== null}
        onClose={closeModal}
        title={modalState?.mode === "edit" ? "Edit Product" : "Add Product"}
        className="max-w-lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && (
            <Toast variant="danger" title={formError} onDismiss={() => setFormError(null)} />
          )}

          <Input
            label="SKU"
            required
            value={values.sku}
            onChange={(event) => updateField("sku", event.target.value)}
            error={fieldErrors.sku?.[0]}
            placeholder="SKU001"
          />
          <Input
            label="Item"
            required
            value={values.item}
            onChange={(event) => updateField("item", event.target.value)}
            error={fieldErrors.item?.[0]}
            placeholder="Product name"
          />
          <Input
            label="ASIN"
            required
            value={values.asin}
            onChange={(event) => updateField("asin", event.target.value)}
            error={fieldErrors.asin?.[0]}
            placeholder="B0ABC12345"
            helperText="Amazon identifier. Letters and numbers only."
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-800">Country</span>
            <div className="flex flex-wrap gap-4">
              {COUNTRY_VALUES.map((country) => (
                <Checkbox
                  key={country}
                  label={country}
                  checked={values.country.includes(country)}
                  onChange={(event) => toggleCountry(country, event.target.checked)}
                />
              ))}
            </div>
            {fieldErrors.country?.[0] && <p className="text-sm text-red-600">{fieldErrors.country[0]}</p>}
          </div>
          <Input
            label="Link"
            value={values.link}
            onChange={(event) => updateField("link", event.target.value)}
            error={fieldErrors.link?.[0]}
            placeholder="https://amazon.com/dp/B0ABC12345"
            helperText="Amazon product link. Optional."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Case Of"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              value={values.caseOf}
              onChange={(event) => updateField("caseOf", event.target.value)}
              error={fieldErrors.caseOf?.[0]}
            />
            <Input
              label="Cases Per Pallet"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              value={values.casesPerPallet}
              onChange={(event) => updateField("casesPerPallet", event.target.value)}
              error={fieldErrors.casesPerPallet?.[0]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Unit of Measurement"
              required
              value={values.unitOfMeasurement}
              onChange={(event) =>
                updateField("unitOfMeasurement", event.target.value as UnitOfMeasurementValue)
              }
              error={fieldErrors.unitOfMeasurement?.[0]}
            >
              <option value="">Select...</option>
              {UNIT_OF_MEASUREMENT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
            <Input
              label="Unit"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              required
              value={values.unit}
              onChange={(event) => updateField("unit", event.target.value)}
              error={fieldErrors.unit?.[0]}
              helperText="Decimals allowed."
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => (deleting ? undefined : setDeleteTarget(null))}
        title="Delete Product"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-700">
          Are you sure you want to delete <strong>{deleteTarget?.sku}</strong> —{" "}
          {deleteTarget?.item}? This action cannot be undone from this screen.
        </p>
      </Modal>
    </div>
  );
}
