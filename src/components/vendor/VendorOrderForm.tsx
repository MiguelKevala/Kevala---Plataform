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
  Input,
  Select,
  Toast,
} from "@/components/ui";
import {
  CARRIER_LABEL_TYPES,
  validateShippingChecklistConsistency,
} from "@/modules/vendor/domain/shipping-checklist";
import {
  computeConfirmationDeadline,
  computeDeliveryDeadline,
} from "@/modules/vendor/domain/vendor-order-deadlines";

export interface VendorOrderFormCatalogOption {
  id: string;
  name: string;
}

export interface VendorOrderFormValues {
  orderNumber: string;
  orderDate: string;
  carrierId: string;
  modeId: string;
  tracking: string;
  deliveryDate: string;
  pickUpDate: string;
  shipmentDate: string;
  invoiceNumber: string;
  cartonLabels: boolean | null;
  bol: boolean | null;
  palletLabels: boolean | null;
  asn: boolean | null;
  carrierLabels: boolean | null;
  carrierLabelType: string | null;
  packingSlip: boolean | null;
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
  CHECKLIST_INVALID: "Please review the shipping checklist.",
};

type BinaryFieldKey = "cartonLabels" | "bol" | "palletLabels" | "asn" | "carrierLabels" | "packingSlip";

const BINARY_FIELDS: Array<{ key: BinaryFieldKey; label: string }> = [
  { key: "cartonLabels", label: "Carton Labels" },
  { key: "bol", label: "BOL" },
  { key: "palletLabels", label: "Pallet Labels" },
  { key: "asn", label: "ASN" },
  { key: "carrierLabels", label: "Carrier Labels" },
  { key: "packingSlip", label: "Packing Slip" },
];

function toSelectValue(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function fromSelectValue(value: string): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

/** "YYYY-MM-DD" (valor de <input type="date">) -> Date en medianoche UTC. */
function parseDateInputValue(value: string): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Confirmation/Delivery Deadline en vivo a partir de Order Date — misma
 * función que usa el backend (única fuente de verdad), solo para mostrar al
 * usuario antes de guardar. Nunca se envían al servidor. */
function computeDeadlineDisplayValues(orderDate: string): {
  confirmationDeadline: string;
  deliveryDeadline: string;
} {
  const parsed = parseDateInputValue(orderDate);
  if (!parsed) {
    return { confirmationDeadline: "", deliveryDeadline: "" };
  }
  return {
    confirmationDeadline: toDateInputValue(computeConfirmationDeadline(parsed)),
    deliveryDeadline: toDateInputValue(computeDeliveryDeadline(parsed)),
  };
}

export function VendorOrderForm({ mode, orderId, initialValues, carriers, modes }: VendorOrderFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<VendorOrderFormValues>(initialValues);
  const [deadlines, setDeadlines] = useState(() => computeDeadlineDisplayValues(initialValues.orderDate));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklistIssues, setChecklistIssues] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function updateField<K extends keyof VendorOrderFormValues>(key: K, value: VendorOrderFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function updateOrderDate(nextOrderDate: string) {
    updateField("orderDate", nextOrderDate);
    setDeadlines(computeDeadlineDisplayValues(nextOrderDate));
  }

  function updateBinaryField(key: BinaryFieldKey, selectValue: string) {
    const value = fromSelectValue(selectValue);
    setValues((previous) => ({
      ...previous,
      [key]: value,
      // Carrier Labels = No -> Carrier Label Type queda oculto y en null.
      ...(key === "carrierLabels" && value !== true ? { carrierLabelType: null } : {}),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setChecklistIssues([]);

    const issues = validateShippingChecklistConsistency({
      bol: values.bol,
      carrierLabels: values.carrierLabels,
      carrierLabelType: values.carrierLabelType,
    });
    if (issues.length > 0) {
      setChecklistIssues(issues);
      setError(ERROR_MESSAGES.CHECKLIST_INVALID);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...(mode === "create" ? { orderNumber: values.orderNumber.trim() } : {}),
        orderDate: values.orderDate,
        carrierId: values.carrierId || null,
        modeId: values.modeId || null,
        tracking: values.tracking.trim() === "" ? null : values.tracking.trim(),
        deliveryDate: values.deliveryDate || null,
        pickUpDate: values.pickUpDate || null,
        shipmentDate: values.shipmentDate || null,
        invoiceNumber: values.invoiceNumber.trim() === "" ? null : Number(values.invoiceNumber),
        cartonLabels: values.cartonLabels,
        bol: values.bol,
        palletLabels: values.palletLabels,
        asn: values.asn,
        carrierLabels: values.carrierLabels,
        carrierLabelType: values.carrierLabelType,
        packingSlip: values.packingSlip,
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
        if (data?.error === "CHECKLIST_INVALID" && Array.isArray(data?.issues)) {
          setChecklistIssues(data.issues);
        }
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
      {error && (
        <Toast
          variant="danger"
          title={error}
          message={checklistIssues.length > 0 ? `Check: ${checklistIssues.join(", ")}` : undefined}
          onDismiss={() => setError(null)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Order Information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
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
              label="Tracking"
              value={values.tracking}
              onChange={(event) => updateField("tracking", event.target.value)}
              error={fieldErrors.tracking?.[0]}
              helperText="Shipment tracking number. Letters, numbers, and hyphens."
              placeholder="1Z999AA10123456784"
            />
          </div>

          <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-4">
            <p className="mb-3 text-sm font-medium text-brand-900">
              Order Date &amp; maximum deadlines
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Order Date"
                type="date"
                required
                value={values.orderDate}
                onChange={(event) => updateOrderDate(event.target.value)}
                error={fieldErrors.orderDate?.[0]}
              />
              <Input
                label="Confirmation Deadline"
                type="date"
                value={deadlines.confirmationDeadline}
                disabled
                helperText="Maximum confirmation date. Calculated automatically."
              />
              <Input
                label="Delivery Deadline"
                type="date"
                value={deadlines.deliveryDeadline}
                disabled
                helperText="Maximum delivery date. Calculated automatically."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Shipment Date"
              type="date"
              value={values.shipmentDate}
              onChange={(event) => updateField("shipmentDate", event.target.value)}
              helperText="When the order was prepared in the warehouse."
            />
            <Input
              label="Pick Up Date"
              type="date"
              value={values.pickUpDate}
              onChange={(event) => updateField("pickUpDate", event.target.value)}
              helperText="When the shipment was picked up."
            />
            <Input
              label="Delivery Date"
              type="date"
              value={values.deliveryDate}
              onChange={(event) => updateField("deliveryDate", event.target.value)}
              helperText="When the order was actually delivered."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Carrier"
              value={values.carrierId}
              onChange={(event) => updateField("carrierId", event.target.value)}
              error={fieldErrors.carrierId?.[0]}
            >
              <option value="">Not assigned</option>
              {carriers.map((carrier) => (
                <option key={carrier.id} value={carrier.id}>
                  {carrier.name}
                </option>
              ))}
            </Select>

            <Select
              label="Mode"
              value={values.modeId}
              onChange={(event) => updateField("modeId", event.target.value)}
              error={fieldErrors.modeId?.[0]}
            >
              <option value="">Not assigned</option>
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
              helperText="Numbers only."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping Checklist</CardTitle>
          <CardDescription>
            Answer Yes or No as documentation and labels become available. Leave a field blank if it has not
            been captured yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {BINARY_FIELDS.map((field) => (
              <Select
                key={field.key}
                label={field.label}
                value={toSelectValue(values[field.key])}
                onChange={(event) => updateBinaryField(field.key, event.target.value)}
              >
                <option value="">Not captured</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            ))}

            {values.carrierLabels === true && (
              <Select
                label="Carrier Label Type"
                required
                value={values.carrierLabelType ?? ""}
                onChange={(event) => updateField("carrierLabelType", event.target.value || null)}
              >
                <option value="">Select a carrier label type</option>
                {CARRIER_LABEL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {values.carrierLabels === false && (
            <p className="mt-4 text-sm text-neutral-500">
              Carrier Labels is No, so <strong>BOL must be Yes</strong>.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
