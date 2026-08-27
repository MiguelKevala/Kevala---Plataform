import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type ToastVariant = "neutral" | "success" | "warning" | "danger" | "info";

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  variant?: ToastVariant;
  title: string;
  message?: string;
  onDismiss?: () => void;
}

const variantClasses: Record<ToastVariant, string> = {
  neutral: "border-neutral-200 bg-white text-neutral-900",
  success: "border-brand-200 bg-brand-50 text-brand-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};

export const Toast = forwardRef<HTMLDivElement, ToastProps>(
  ({ variant = "neutral", title, message, onDismiss, className, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 shadow-sm",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      <div className="flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {message && <p className="mt-1 text-sm opacity-90">{message}</p>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="text-sm opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  ),
);

Toast.displayName = "Toast";
