import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

const field =
  "w-full rounded-md border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted " +
  "outline-none transition-colors focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
const fieldOk = "border-border focus:border-accent focus:ring-accent/40";
const fieldError = "border-danger focus:border-danger focus:ring-danger/40";

type FieldExtras = {
  label?: string;
  /** Error message. Presence switches the field to the error state. */
  error?: string;
};

function Wrapper({
  id,
  label,
  error,
  children,
}: FieldExtras & { id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ label, error, className, id, ...props }: ComponentProps<"input"> & FieldExtras) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Wrapper id={fieldId} label={label} error={error}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={cn(field, error ? fieldError : fieldOk, className)}
        {...props}
      />
    </Wrapper>
  );
}

export function Textarea({ label, error, className, id, ...props }: ComponentProps<"textarea"> & FieldExtras) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Wrapper id={fieldId} label={label} error={error}>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={cn(field, "min-h-20 resize-y", error ? fieldError : fieldOk, className)}
        {...props}
      />
    </Wrapper>
  );
}
