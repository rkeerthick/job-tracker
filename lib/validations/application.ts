import { z } from "zod";
import { applicationStatus } from "@/db/schema";

export const createApplicationSchema = z.object({
  // trim first so "   " doesn't sneak past min(1); max matches varchar(255)
  company: z.string({ error: "Company is required" }).trim().min(1, "Company is required").max(255),
  role: z.string({ error: "Role is required" }).trim().min(1, "Role is required").max(255),

  // Optional. "" (empty form field) counts as not provided.
  // http/https only — this ends up in an href, so block javascript: etc.
  link: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.url({ protocol: /^https?$/, error: "Link must be a valid http(s) URL" }).optional(),
  ),

  // Same values as the Postgres enum; DB default ("applied") kicks in when omitted.
  status: z.enum(applicationStatus.enumValues).optional(),
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
