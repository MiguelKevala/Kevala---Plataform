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
}

type ActiveModal = "confirm" | "reject" | "deliver" | null;

const REASON_MAX_LENGTH = 500;
const COMMENTS_MAX_LENGTH = 1000;

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Tu sesión expiró. Vuelve a iniciar sesión.",
  FORBIDDEN: "No tienes permiso para realizar esta acción.",
  NOT_FOUND: "La orden ya no existe.",
  CONFLICT: "La orden ya cambió de estado. Actualiza la página e intenta de nuevo.",
  VALIDATION_ERROR: "Revisa los datos ingresados.",
};

export function VendorOrderActions({
  orderId,
  status,
  canConfirm,
  canReject,
  canDeliver,
}: VendorOrderActionsProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    try {
      const response = await fetch(`/api/vendor/ordenes/${orderId}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(ERROR_MESSAGES[data?.error] ?? "No se pudo completar la acción.");
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
      setReasonError("El motivo es obligatorio.");
      return;
    }
    setReasonError(null);
    void runAction("reject", { reason: trimmed, comments: comments.trim() || undefined });
  }

  const showConfirm = status === "PENDING" && canConfirm;
  const showReject = status === "PENDING" && canReject;
  const showDeliver = status === "CONFIRMED" && canDeliver;

  if (!showConfirm && !showReject && !showDeliver) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {showConfirm && (
          <Button size="sm" onClick={() => setActiveModal("confirm")}>
            Confirmar orden
          </Button>
        )}
        {showReject && (
          <Button size="sm" variant="danger" onClick={() => setActiveModal("reject")}>
            Rechazar orden
          </Button>
        )}
        {showDeliver && (
          <Button size="sm" onClick={() => setActiveModal("deliver")}>
            Marcar como entregada
          </Button>
        )}
      </div>

      {error && (
        <Toast variant="danger" title={error} onDismiss={() => setError(null)} className="w-full" />
      )}

      {showConfirm && (
        <Modal
          open={activeModal === "confirm"}
          onClose={closeModal}
          title="Confirmar orden"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeModal} disabled={loading}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => runAction("confirm")} disabled={loading}>
                {loading ? "Confirmando..." : "Confirmar"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-600">
            La orden pasará al estado <strong>Confirmada</strong>. ¿Deseas continuar?
          </p>
        </Modal>
      )}

      {showDeliver && (
        <Modal
          open={activeModal === "deliver"}
          onClose={closeModal}
          title="Marcar como entregada"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeModal} disabled={loading}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => runAction("deliver")} disabled={loading}>
                {loading ? "Guardando..." : "Marcar como entregada"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-600">
            La orden pasará al estado <strong>Entregada</strong>. ¿Deseas continuar?
          </p>
        </Modal>
      )}

      {showReject && (
        <Modal
          open={activeModal === "reject"}
          onClose={closeModal}
          title="Rechazar orden"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeModal} disabled={loading}>
                Cancelar
              </Button>
              <Button variant="danger" size="sm" onClick={handleReject} disabled={loading}>
                {loading ? "Rechazando..." : "Confirmar rechazo"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Motivo"
              required
              maxLength={REASON_MAX_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              error={reasonError ?? undefined}
            />
            <Input
              label="Comentarios (opcional)"
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
