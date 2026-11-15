import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Red error box. role="alert" so screen readers announce it when it appears. */
export function Alert({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="alert"
      className={cn("rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger", className)}
      {...props}
    />
  );
}
