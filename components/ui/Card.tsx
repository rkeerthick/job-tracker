import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Surface + border + padding. Pass className to adjust (e.g. "p-3"). */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-border bg-surface p-4", className)} {...props} />;
}
