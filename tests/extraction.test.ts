import { describe, expect, it } from "vitest";
import { EXTRACTION_SYSTEM_PROMPT, extractionSchema, isUnreadable } from "@/lib/extraction";

const full = {
  company: "Acme",
  role: "Frontend Developer",
  location: "Bengaluru",
  salaryText: "₹12–18 LPA",
  skills: ["React", "TypeScript"],
};

describe("extractionSchema", () => {
  it("accepts a fully filled extraction", () => {
    expect(extractionSchema.safeParse(full).success).toBe(true);
  });

  it("accepts null for fields the posting doesn't state, and an empty skills list", () => {
    const r = extractionSchema.safeParse({
      ...full, location: null, salaryText: null, skills: [],
    });
    expect(r.success).toBe(true);
  });

  it("requires nullable fields to be present: the model must say null, not omit them", () => {
    const withoutLocation: Partial<typeof full> = { ...full };
    delete withoutLocation.location;
    expect(extractionSchema.safeParse(withoutLocation).success).toBe(false);
  });

  it("accepts null company/role (the model must say null instead of inventing a placeholder)", () => {
    expect(extractionSchema.safeParse({ ...full, company: null, role: null }).success).toBe(true);
  });

  it("rejects an empty or missing company or role: use null, not \"\" or an omitted key", () => {
    expect(extractionSchema.safeParse({ ...full, company: "" }).success).toBe(false);
    expect(extractionSchema.safeParse({ ...full, role: "   " }).success).toBe(false);
    expect(extractionSchema.safeParse({ ...full, company: undefined }).success).toBe(false);
  });

  it("isUnreadable: only when BOTH company and role are null", () => {
    expect(isUnreadable({ ...full, company: null, role: null })).toBe(true);
    expect(isUnreadable({ ...full, company: null })).toBe(false);
    expect(isUnreadable({ ...full, role: null })).toBe(false);
    expect(isUnreadable(full)).toBe(false);
  });

  it("rejects a salary that isn't a string or null (e.g. a bare number)", () => {
    expect(extractionSchema.safeParse({ ...full, salaryText: 1800000 }).success).toBe(false);
  });

  it("rejects blank skill entries and more than 30 skills", () => {
    expect(extractionSchema.safeParse({ ...full, skills: ["React", "  "] }).success).toBe(false);
    expect(extractionSchema.safeParse({ ...full, skills: Array.from({ length: 31 }, (_, i) => `s${i}`) }).success).toBe(false);
  });

  it("rejects skills that aren't an array of strings", () => {
    expect(extractionSchema.safeParse({ ...full, skills: "React" }).success).toBe(false);
    expect(extractionSchema.safeParse({ ...full, skills: [1, 2] }).success).toBe(false);
  });
});

describe("EXTRACTION_SYSTEM_PROMPT", () => {
  it("only talks about fields that exist in the schema (no stale salaryMin/salaryMax)", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).not.toMatch(/salaryMin|salaryMax/);
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("salaryText");
  });

  it("treats the posting as untrusted data (prompt-injection guard)", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/untrusted data/i);
  });

  it("takes the role from the job title, and skills from anywhere including the title", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/role: the job title/i);
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/including the title/i);
  });

  it("forbids placeholder values like 'Not specified'", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/placeholder/i);
  });

  it("treats 'not disclosed' style salaries as null", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/not disclosed/i);
  });

  it("tells the model to return null instead of guessing", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("If a value is not in the text, return null. Do not guess.");
  });
});
