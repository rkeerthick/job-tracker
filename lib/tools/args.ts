import { z } from "zod";
import { STATUSES } from "@/lib/statuses";

// Model-supplied arguments are untrusted input: validate every call, and return a short,
// specific error the model can read and recover from (e.g. "withinDays must be 1-30").
// userId is deliberately NOT an argument: it is bound by the server from the session.

// Models often send null (or "") for an optional argument they don't want to set.
const unset = (v: unknown) => (v === null || v === "" ? undefined : v);

export const searchApplicationsArgs = z.object({
  query: z.preprocess(
    unset,
    z.string({ error: "query must be a string" }).trim().max(100, "query must be at most 100 characters").optional(),
  ),
  status: z.preprocess(
    (v) => (typeof v === "string" ? unset(v.trim().toLowerCase()) : unset(v)),
    z.enum(STATUSES, { error: `status must be one of: ${STATUSES.join(", ")}` }).optional(),
  ),
  limit: z.preprocess(
    unset,
    z.coerce
      .number({ error: "limit must be an integer 1-20" })
      .int("limit must be an integer 1-20")
      .min(1, "limit must be 1-20")
      .max(20, "limit must be 1-20")
      .default(10),
  ),
});
export type SearchApplicationsArgs = z.infer<typeof searchApplicationsArgs>;

export const upcomingInterviewsArgs = z.object({
  withinDays: z.preprocess(
    unset,
    z.coerce
      .number({ error: "withinDays must be 1-30" })
      .int("withinDays must be 1-30")
      .min(1, "withinDays must be 1-30")
      .max(30, "withinDays must be 1-30")
      .default(7),
  ),
});
export type UpcomingInterviewsArgs = z.infer<typeof upcomingInterviewsArgs>;

export type ParsedArgs<T> = { ok: true; data: T } | { ok: false; error: string };

/** Accepts the raw args as an object or as a JSON string (some providers send a string). */
export function parseToolArgs<S extends z.ZodType>(schema: S, raw: unknown): ParsedArgs<z.infer<S>> {
  let input = raw ?? {};
  if (typeof input === "string") {
    try {
      input = input.trim() === "" ? {} : JSON.parse(input);
    } catch {
      return { ok: false, error: "Arguments must be a JSON object" };
    }
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Arguments must be a JSON object" };
  }

  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error.issues[0]?.message ?? "Invalid arguments" };
}
