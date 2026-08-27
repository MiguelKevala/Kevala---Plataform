import { type InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, id, className, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id ?? generatedId;

    return (
      <label
        htmlFor={checkboxId}
        className="flex items-center gap-2 text-sm text-neutral-800 select-none"
      >
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          className={cn(
            "h-4 w-4 rounded border-neutral-300 text-brand-600",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {label}
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
