// Pure zod schemas: no DB, no Next runtime, so they're directly unit-testable.
import { z } from "zod";
import { STATUSES } from "@/lib/statuses";

// "" (an empty form field) counts as not provided.
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const createApplicationSchema = z.object({
  // trim first so "   " doesn't sneak past min(1); max matches varchar(255)
  company: z.string({ error: "Company is required" }).trim().min(1, "Company is required").max(255),
  role: z.string({ error: "Role is required" }).trim().min(1, "Role is required").max(255),

  // Optional. "" (empty form field) counts as not provided.
  // http/https only: this ends up in an href, so block javascript: etc.
  link: z.preprocess(
    emptyToUndefined,
    z.url({ protocol: /^https?$/, error: "Link must be a valid http(s) URL" }).optional(),
  ),

  // Optional text fields; "" counts as not provided. max matches varchar(255).
  location: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()),
  salaryText: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()), // verbatim, e.g. "12-18 LPA"

  // Optional list, at most 30. A blank entry is an error (same rule as the extraction schema).
  skills: z.array(z.string().trim().min(1, "Skill can't be blank").max(100)).max(30, "At most 30 skills").optional(),

  // Same values as the Postgres enum (both come from lib/statuses.ts); the DB default ("saved") applies when omitted.
  status: z.enum(STATUSES).optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

// PATCH: every field optional, at least one required.
// link may be null (or "") to clear it.
export const updateApplicationSchema = z
  .object({
    company: createApplicationSchema.shape.company.optional(),
    role: createApplicationSchema.shape.role.optional(),
    link: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.url({ protocol: /^https?$/, error: "Link must be a valid http(s) URL" }).nullable().optional(),
    ),
    status: createApplicationSchema.shape.status,
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    error: "Provide at least one field to update",
  });

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const noteSchema = z.object({
  body: z
    .string({ error: "Note is required" })
    .trim()
    .min(1, "Note is required")
    .max(2000, "Note must be at most 2000 characters"),
});

// POST /api/extract: the job posting text. The upper bound also caps what one request can cost.
export const extractRequestSchema = z.object({
  text: z
    .string({ error: "Text is required" })
    .trim()
    .min(20, "Paste the full job posting (at least 20 characters)")
    .max(20000, "Job posting is too long (max 20,000 characters)"),
});
