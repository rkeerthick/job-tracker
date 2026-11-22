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

  it("rejects unknown keys (userId, id) instead of dropping them", () => {
    expect(updateApplicationSchema.safeParse({ status: "offer", userId: 999 }).success).toBe(false);
    expect(updateApplicationSchema.safeParse({ status: "offer", id: 5 }).success).toBe(false);
    expect(updateApplicationSchema.safeParse({ createdAt: "2026-01-01" }).success).toBe(false);
  });

  it("absent = untouched: only the sent keys appear in the output", () => {
    const r = updateApplicationSchema.safeParse({ status: "offer" });
    expect(r.success && Object.keys(r.data)).toEqual(["status"]);
  });

  it("null clears link, location, salaryText and interviewAt; blank text becomes null", () => {
    const r = updateApplicationSchema.safeParse({ link: null, location: null, salaryText: "  ", interviewAt: null });
    expect(r.success && r.data).toEqual({ link: null, location: null, salaryText: null, interviewAt: null });
  });

  it("company, role and status cannot be cleared with null", () => {
    for (const k of ["company", "role", "status"]) {
      expect(updateApplicationSchema.safeParse({ [k]: null }).success).toBe(false);
    }
  });

  it("an empty body is rejected, but a lone null counts as a field", () => {
    expect(updateApplicationSchema.safeParse({}).success).toBe(false);
    expect(updateApplicationSchema.safeParse({ interviewAt: null }).success).toBe(true);
  });

  describe("interviewAt", () => {
    const parse = (v: unknown) => updateApplicationSchema.safeParse({ interviewAt: v });

    it("accepts ISO with an offset or Z and returns a Date for the same instant", () => {
      const a = parse("2026-12-01T10:00:00+05:30");
      const z = parse("2026-12-01T04:30:00Z");
      expect(a.success && a.data.interviewAt instanceof Date).toBe(true);
      expect(a.success && z.success && a.data.interviewAt?.getTime()).toBe(z.success ? z.data.interviewAt?.getTime() : -1);
    });

    it("rejects strings without an offset, date-only, garbage and non-strings", () => {
      for (const v of ["2026-12-01T10:00:00", "2026-12-01", "tomorrow", "", 1764583200000, {}]) {
        expect(parse(v).success).toBe(false);
      }
    });

    it("only allows the years 2000-2100", () => {
      expect(parse("0002-12-01T10:00:00Z").success).toBe(false);
      expect(parse("1999-12-31T23:59:59Z").success).toBe(false);
      expect(parse("2101-01-01T00:00:00Z").success).toBe(false);
      expect(parse("2000-01-01T00:00:00Z").success).toBe(true);
      expect(parse("2100-12-31T23:59:59Z").success).toBe(true);
    });
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

describe("createApplicationSchema interviewAt", () => {
  const base = { company: "Acme", role: "Dev" };
  it("accepts an ISO instant (as a Date), null, or nothing", () => {
    const r = createApplicationSchema.safeParse({ ...base, interviewAt: "2026-11-24T09:30:00.000Z" });
    expect(r.success && r.data.interviewAt).toEqual(new Date("2026-11-24T09:30:00.000Z"));
    expect(createApplicationSchema.safeParse({ ...base, interviewAt: null }).success).toBe(true);
    expect(createApplicationSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a local value without an offset and out-of-range years", () => {
    expect(createApplicationSchema.safeParse({ ...base, interviewAt: "2026-11-24T15:00" }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ ...base, interviewAt: "0002-11-24T15:00:00Z" }).success).toBe(false);
  });
});
