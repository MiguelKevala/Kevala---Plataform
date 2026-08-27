"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Toast } from "@/components/ui";
import type { VendorOrderStatus } from "@/generated/prisma/client";

export interface VendorOrderActionsProps {
  orderId: string;
  status: VendorOrderStatus;
  canConfirm: boolean;
  canReject: boolean;
  canDeliver: boolean;
  /** Campos del Shipping Checklist que faltan para poder entregar (calculado
   * en el servidor con la misma validación centralizada que usa el backend
   * en deliverVendorOrder). Vacío = la orden está lista para DELIVERED. */
  deliveryMissingFields: string[];
}

type ActiveModal = "confirm" | "reject" | "deliver" | null;

const REASON_MAX_LENGTH = 500;
const COMMENTS_MAX_LENGTH = 1000;

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Please log in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "This order no longer exists.",
  CONFLICT: "This order already changed status. Refresh the page and try again.",
  VALIDATION_ERROR: "Please review the entered information.",
  INCOMPLETE: "Order cannot be delivered. Complete the required shipping information first.",
};

export function VendorOrderActions({
  orderId,
  status,
  canConfirm,
  canReject,
  canDeliver,
  deliveryMissingFields,
}: VendorOrderActionsProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incompleteFields, setIncompleteFields] = useState<string[]>([]);

  function closeModal() {
    if (loading) return;
    setActiveModal(null);
    setReason("");
    setComments("");
    setReasonError(null);
  }

  async function runAction(path: "confirm" | "reject" | "deliver", body?: unknown) {
    setLoading(true);
    setError(null);
    setIncompleteFields([]);

    try {
      const response = await fetch(`/api/vendor/ordenes/${orderId}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(ERROR_MESSAGES[data?.error] ?? "Could not complete this action.");
        if (data?.error === "INCOMPLETE" && Array.isArray(data?.missingFields)) {
          setIncompleteFields(data.missingFields);
        }
        return;
      }

      setActiveModal(null);
      setReason("");
      setComments("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function handleReject() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("Reason is required.");
      return;
    }
    setReasonError(null);
    void runAction("reject", { reason: trimmed, comments: comments.trim() || undefined });
  }

  const showConfirm = status === "PENDING" && canConfirm;
  const showReject = status === "PENDING" && canReject;
  const showDeliver = status === "CONFIRMED" && canDeliver;
  const isDeliveryReady = deliveryMissingFields.length === 0;

  if (!showConfirm && !showReject && !showDeliver) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {showConfirm && (
          <Button size="sm" onClick={() => setActiveModal("confirm")}>
            Confirm Order
          </Button>
        )}
        {showReject && (
          <Button size="sm" variant="danger" onClick={() => setActiveModal("reject")}>
            Reject Order
          </Button>
        )}
        {showDeliver && (
          <Button
            size="sm"
            disabled={!isDeliveryReady}
            title={isDeliveryReady ? undefined : "Complete the required shipping information first."}
            onClick={() => setActiveModal("deliver")}
          >
            Mark as Delivered
          </Button>
        )}
      </div>

      {showDeliver && !isDeliveryReady && (
        <div className="w-full rounded-md border border-amber-200 bg-amber-50 p-3 text-right text-sm text-amber-900">
          <p className="font-medium">
            Order cannot be delivered. Complete the required shipping information first.
          </p>
          <ul className="mt-1 list-inside list-disc text-amber-800">
            {deliveryMissingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <Toast
          variant="danger"
          title={error}
          message={incompleteFields.length > 0 ? `Missing: ${incompleteFields.join(", ")}` : undefined}
          onDismiss={() => setError(null)}
          className="w-full"
        />
      )}

      {showConfirm && (
        <Modal
          open={activeModal === "confirm"}
          onClose={closeModal}
          title="Confirm Order"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeModal} disabled={loading}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => runAction("confirm")} disabled={loading}>
                {loading ? "Confirming..." : "Confirm"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-600">
            This order will move to <strong>Confirmed</strong>. Do you want to continue?
          </p>
        </Modal>
      )}

      {showDeliver && (
        <Modal
          open={activeModal === "deliver"}
          onClose={closeModal}
          title="Mark as Delivered"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeModal} disabled={loading}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => runAction("deliver")} disabled={loading}>
                {loading ? "Saving..." : "Mark as Delivered"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-600">
            This order will move to <strong>Delivered</strong>. Do you want to continue?
          </p>
        </Modal>
      )}

      {showReject && (
        <Modal
          open={activeModal === "reject"}
          onClose={closeModal}
          title="Reject Order"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeModal} disabled={loading}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleReject} disabled={loading}>
                {loading ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Reason"
              required
              maxLength={REASON_MAX_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              error={reasonError ?? undefined}
            />
            <Input
              label="Comments (optional)"
              maxLength={COMMENTS_MAX_LENGTH}
              value={comments}
              onChange={(event) => setComments(event.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
