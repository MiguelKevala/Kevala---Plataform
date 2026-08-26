"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className={cn(
        "w-full max-w-md rounded-lg border border-neutral-200 bg-white p-0 shadow-lg backdrop:bg-neutral-900/40",
        className,
      )}
    >
      {title && (
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-3 border-t border-neutral-200 px-6 py-4">
          {footer}
        </div>
      )}
    </dialog>
  );
}
