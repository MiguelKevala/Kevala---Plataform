"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Input, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toast } from "@/components/ui";

interface CatalogItem {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CatalogAdminTableProps {
  resourceName: string;
  resourceNamePlural: string;
  apiBasePath: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Please log in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "This item no longer exists.",
  DUPLICATE_NAME: "This name is already in use.",
  VALIDATION_ERROR: "Please review the highlighted field.",
};

type ModalState = { mode: "create" } | { mode: "edit"; item: CatalogItem } | null;

export function CatalogAdminTable({ resourceName, resourceNamePlural, apiBasePath }: CatalogAdminTableProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function loadItems() {
    setLoading(true);
    fetch(apiBasePath)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setItems(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;

    fetch(apiBasePath)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setItems(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreateModal() {
    setNameInput("");
    setNameError(null);
    setModalState({ mode: "create" });
  }

  function openEditModal(item: CatalogItem) {
    setNameInput(item.name);
    setNameError(null);
    setModalState({ mode: "edit", item });
  }

  function closeModal() {
    if (submitting) return;
    setModalState(null);
  }

  async function handleSubmitName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const url = modalState?.mode === "edit" ? `${apiBasePath}/${modalState.item.id}` : apiBasePath;
      const method = modalState?.mode === "edit" ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.error === "DUPLICATE_NAME") {
          setNameError(ERROR_MESSAGES.DUPLICATE_NAME);
        } else {
          setError(ERROR_MESSAGES[data?.error] ?? `Could not save this ${resourceName.toLowerCase()}.`);
        }
        return;
      }

      setModalState(null);
      loadItems();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(item: CatalogItem) {
    setError(null);
    const action = item.isActive ? "deactivate" : "activate";
    try {
      const response = await fetch(`${apiBasePath}/${item.id}/${action}`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(ERROR_MESSAGES[data?.error] ?? `Could not update this ${resourceName.toLowerCase()}.`);
        return;
      }
      loadItems();
    } catch {
      setError(`Could not update this ${resourceName.toLowerCase()}.`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">{resourceNamePlural}</h1>
        <Button onClick={openCreateModal}>New {resourceName}</Button>
      </div>

      {error && <Toast variant="danger" title={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">No {resourceNamePlural.toLowerCase()} yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  <Badge variant={item.isActive ? "success" : "neutral"}>
                    {item.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditModal(item)}>
                      Edit
                    </Button>
                    <Button
                      variant={item.isActive ? "danger" : "secondary"}
                      size="sm"
                      onClick={() => handleToggleActive(item)}
                    >
                      {item.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={modalState !== null}
        onClose={closeModal}
        title={modalState?.mode === "edit" ? `Edit ${resourceName}` : `New ${resourceName}`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmitName} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <Input
          label="Name"
          required
          value={nameInput}
          onChange={(event) => setNameInput(event.target.value)}
          error={nameError ?? undefined}
        />
      </Modal>
    </div>
  );
}
