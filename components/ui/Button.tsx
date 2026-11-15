import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50";

// `enabled:` so hover styles never apply to a disabled button.
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg enabled:hover:bg-accent/85",
  secondary: "border border-border bg-surface text-text enabled:hover:bg-border/60",
  danger: "bg-danger-solid text-white enabled:hover:bg-danger-solid/85",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-sm",
  md: "px-3.5 py-2 text-sm",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button", // not "submit" by default: avoids accidental form submits
  className,
  ...props
}: ButtonProps) {
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
