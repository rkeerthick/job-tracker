import { describe, expect, it } from "vitest";
import { createApplicationSchema, noteSchema, updateApplicationSchema } from "@/lib/validation";

const valid = { company: "Acme", role: "Frontend Dev" };

describe("createApplicationSchema", () => {
  it("accepts company + role only", () => {
    expect(createApplicationSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts all fields", () => {
    const r = createApplicationSchema.safeParse({
      ...valid,
      link: "https://acme.com/jobs/1",
      status: "interview",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing or blank company", () => {
    expect(createApplicationSchema.safeParse({ role: "x" }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ ...valid, company: "   " }).success).toBe(false);
  });

  it("rejects a malformed link and non-http(s) schemes", () => {
    expect(createApplicationSchema.safeParse({ ...valid, link: "not a url" }).success).toBe(false);
    // The link ends up in an href, so javascript: must never get through.
    expect(createApplicationSchema.safeParse({ ...valid, link: "javascript:alert(1)" }).success).toBe(false);
  });

  it("treats an empty link as not provided", () => {
    const r = createApplicationSchema.safeParse({ ...valid, link: "" });
    expect(r.success && r.data.link).toBeUndefined();
  });

  it("rejects an unknown status", () => {
    expect(createApplicationSchema.safeParse({ ...valid, status: "ghosted" }).success).toBe(false);
  });

  it("drops userId from the parsed output (no spoofing the owner)", () => {
    const r = createApplicationSchema.safeParse({ ...valid, userId: 999 });
    expect(r.success).toBe(true);
    expect(r.success && "userId" in r.data).toBe(false);
  });
});

describe("updateApplicationSchema", () => {
  it("rejects an empty update", () => {
    expect(updateApplicationSchema.safeParse({}).success).toBe(false);
  });

  it("allows clearing the link with null", () => {
    const r = updateApplicationSchema.safeParse({ link: null });
    expect(r.success && r.data.link).toBeNull();
  });

  it("drops userId from the parsed output", () => {
    const r = updateApplicationSchema.safeParse({ status: "offer", userId: 999 });
    expect(r.success && "userId" in r.data).toBe(false);
  });
});

describe("noteSchema", () => {
  it("rejects blank bodies and bodies over 2000 chars", () => {
    expect(noteSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "a".repeat(2001) }).success).toBe(false);
  });

  it("accepts exactly 2000 chars", () => {
    expect(noteSchema.safeParse({ body: "a".repeat(2000) }).success).toBe(true);
  });
});
