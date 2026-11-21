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

  it("accepts location, salaryText and skills", () => {
    const r = createApplicationSchema.safeParse({
      ...valid, location: "Bengaluru", salaryText: "12-18 LPA", skills: ["React", "TS"],
    });
    expect(r.success && r.data).toMatchObject({ location: "Bengaluru", salaryText: "12-18 LPA", skills: ["React", "TS"] });
  });

  it("treats empty location and salaryText as not provided", () => {
    const r = createApplicationSchema.safeParse({ ...valid, location: "", salaryText: "   " });
    expect(r.success && r.data.location).toBeUndefined();
    expect(r.success && r.data.salaryText).toBeUndefined();
  });

  it("rejects location or salaryText over 255 chars", () => {
    expect(createApplicationSchema.safeParse({ ...valid, location: "a".repeat(256) }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ ...valid, salaryText: "a".repeat(256) }).success).toBe(false);
  });

  it("rejects more than 30 skills, blank skills, and non-array skills", () => {
    const many = Array.from({ length: 31 }, (_, i) => `s${i}`);
    expect(createApplicationSchema.safeParse({ ...valid, skills: many }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ ...valid, skills: Array.from({ length: 30 }, (_, i) => `s${i}`) }).success).toBe(true);
    expect(createApplicationSchema.safeParse({ ...valid, skills: ["React", " "] }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ ...valid, skills: "React" }).success).toBe(false);
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
