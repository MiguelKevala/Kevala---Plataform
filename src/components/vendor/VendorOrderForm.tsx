"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Select,
  Toast,
} from "@/components/ui";

export interface VendorOrderFormCatalogOption {
  id: string;
  name: string;
}

export interface VendorOrderFormValues {
  orderNumber: string;
  orderDate: string;
  confirmationDeadline: string;
  deliveryDeadline: string;
  carrierId: string;
  modeId: string;
  invoiceNumber: string;
  cartonLabels: boolean;
  bol: boolean;
  palletLabels: boolean;
  amzx: boolean;
  upsLabels: boolean;
  ontracLabels: boolean;
  asn: boolean;
}

export interface VendorOrderFormProps {
  mode: "create" | "edit";
  orderId?: string;
  initialValues: VendorOrderFormValues;
  carriers: VendorOrderFormCatalogOption[];
  modes: VendorOrderFormCatalogOption[];
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Please log in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "This order no longer exists.",
  DUPLICATE_ORDER_NUMBER: "A vendor order with this PO # already exists.",
  CARRIER_NOT_FOUND: "The selected carrier no longer exists.",
  INACTIVE_CARRIER: "The selected carrier is not active. Please choose another carrier.",
  MODE_NOT_FOUND: "The selected mode no longer exists.",
  INACTIVE_MODE: "The selected mode is not active. Please choose another mode.",
  VALIDATION_ERROR: "Please review the highlighted fields.",
};

const CHECKLIST_FIELDS: Array<{ key: keyof VendorOrderFormValues; label: string }> = [
  { key: "cartonLabels", label: "Carton Labels" },
  { key: "bol", label: "BOL" },
  { key: "palletLabels", label: "Pallet Labels" },
  { key: "amzx", label: "AMZX" },
  { key: "upsLabels", label: "UPS Labels" },
  { key: "ontracLabels", label: "OnTrac Labels" },
  { key: "asn", label: "ASN" },
];

export function VendorOrderForm({ mode, orderId, initialValues, carriers, modes }: VendorOrderFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<VendorOrderFormValues>(initialValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const noActiveCarriers = carriers.length === 0;
  const noActiveModes = modes.length === 0;

  function updateField<K extends keyof VendorOrderFormValues>(key: K, value: VendorOrderFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const payload = {
        ...(mode === "create" ? { orderNumber: values.orderNumber.trim() } : {}),
        orderDate: values.orderDate,
        confirmationDeadline: values.confirmationDeadline || null,
        deliveryDeadline: values.deliveryDeadline || null,
        carrierId: values.carrierId,
        modeId: values.modeId,
        invoiceNumber: values.invoiceNumber.trim() === "" ? null : Number(values.invoiceNumber),
        cartonLabels: values.cartonLabels,
        bol: values.bol,
        palletLabels: values.palletLabels,
        upsLabels: values.upsLabels,
        ontracLabels: values.ontracLabels,
        amzx: values.amzx,
        asn: values.asn,
      };

      const url = mode === "create" ? "/api/vendor/ordenes" : `/api/vendor/ordenes/${orderId}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(ERROR_MESSAGES[data?.error] ?? "Could not save this order.");
        setFieldErrors(data?.issues ?? {});
        return;
      }

      const savedOrderId = mode === "create" ? data.order.id : orderId;
      router.push(`/vendor/ordenes/${savedOrderId}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <Toast variant="danger" title={error} onDismiss={() => setError(null)} />}

      <Card>
        <CardHeader>
          <CardTitle>Order Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {mode === "create" ? (
              <Input
                label="PO #"
                required
                value={values.orderNumber}
                onChange={(event) => updateField("orderNumber", event.target.value)}
                error={fieldErrors.orderNumber?.[0]}
              />
            ) : (
              <Input label="PO #" value={values.orderNumber} disabled helperText="PO # cannot be changed after creation." />
            )}

            <Input
              label="Order Date"
              type="date"
              required
              value={values.orderDate}
              onChange={(event) => updateField("orderDate", event.target.value)}
              error={fieldErrors.orderDate?.[0]}
            />

            <Input
              label="Confirmation Deadline"
              type="date"
              value={values.confirmationDeadline}
              onChange={(event) => updateField("confirmationDeadline", event.target.value)}
            />

            <Input
              label="Delivery Deadline"
              type="date"
              value={values.deliveryDeadline}
              onChange={(event) => updateField("deliveryDeadline", event.target.value)}
            />

            <Select
              label="Carrier"
              required
              disabled={noActiveCarriers}
              value={values.carrierId}
              onChange={(event) => updateField("carrierId", event.target.value)}
              error={fieldErrors.carrierId?.[0] ?? (noActiveCarriers ? "No active carriers available." : undefined)}
            >
              {carriers.map((carrier) => (
                <option key={carrier.id} value={carrier.id}>
                  {carrier.name}
                </option>
              ))}
            </Select>

            <Select
              label="Mode"
              required
              disabled={noActiveModes}
              value={values.modeId}
              onChange={(event) => updateField("modeId", event.target.value)}
              error={fieldErrors.modeId?.[0] ?? (noActiveModes ? "No active modes available." : undefined)}
            >
              {modes.map((modeOption) => (
                <option key={modeOption.id} value={modeOption.id}>
                  {modeOption.name}
                </option>
              ))}
            </Select>

            <Input
              label="Invoice #"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.invoiceNumber}
              onChange={(event) => updateField("invoiceNumber", event.target.value)}
              error={fieldErrors.invoiceNumber?.[0]}
              helperText="Optional. Numbers only."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping Checklist</CardTitle>
          <CardDescription>Check off documentation and labels as they become available.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CHECKLIST_FIELDS.map((field) => (
              <Checkbox
                key={field.key}
                label={field.label}
                checked={values[field.key] as boolean}
                onChange={(event) => updateField(field.key, event.target.checked as VendorOrderFormValues[typeof field.key])}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || noActiveCarriers || noActiveModes}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
