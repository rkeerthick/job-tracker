import { NextResponse } from "next/server";
import { log } from "@/lib/log";

/** Logs an unexpected failure and returns a generic 500 (no internals leak to the client). */
export function internalError(
  message: string,
  fields: { route: string; userId?: number },
  error: unknown,
): NextResponse {
  log("error", message, { ...fields, error });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
