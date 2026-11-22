import { afterEach, describe, expect, it } from "vitest";
import { emptyApplicationValues, type ApplicationFormValues } from "@/components/ApplicationFields";
import { buildUpdatePayload, valuesFromApplication } from "@/lib/application-form";
import type { Application } from "@/lib/applications";
import { formatInterviewIST } from "@/lib/tools/time";

const original = process.env.TZ;
afterEach(() => { process.env.TZ = original; if (original === undefined) delete process.env.TZ; });

const app: Application = {
  id: 1, userId: 1, company: "Acme", role: "Dev", link: "https://acme.com", status: "saved",
  location: "Chennai", salaryText: "12 LPA", skills: ["React", "TS"],
  interviewAt: new Date("2026-11-24T09:30:00.000Z"), appliedAt: null, createdAt: new Date("2026-11-14T10:00:00Z"),
};

describe("valuesFromApplication", () => {
  it("fills every input, showing the interview in the browser's local time", () => {
    process.env.TZ = "Asia/Kolkata";
    expect(valuesFromApplication(app)).toEqual({
      company: "Acme", role: "Dev", link: "https://acme.com", location: "Chennai", salaryText: "12 LPA",
      skillsText: "React, TS", interviewAt: "2026-11-24T15:00",
    });
  });
  it("turns nulls into empty strings", () => {
    expect(valuesFromApplication({ ...app, link: null, location: null, salaryText: null, skills: null, interviewAt: null }))
      .toMatchObject({ link: "", location: "", salaryText: "", skillsText: "", interviewAt: "" });
  });
});

describe("buildUpdatePayload", () => {
  const initial = (): ApplicationFormValues => { process.env.TZ = "Asia/Kolkata"; return valuesFromApplication(app); };

  it("sends nothing when nothing changed (including whitespace-only edits)", () => {
    const i = initial();
    expect(buildUpdatePayload(i, { ...i })).toEqual({});
    expect(buildUpdatePayload(i, { ...i, company: "  Acme " })).toEqual({});
    expect(buildUpdatePayload(i, { ...i, skillsText: "React,TS" })).toEqual({});
  });

  it("sends only the changed fields", () => {
    const i = initial();
    expect(buildUpdatePayload(i, { ...i, role: " Senior Dev ", location: "Pune" })).toEqual({ role: "Senior Dev", location: "Pune" });
  });

  it("sends null for a cleared optional field (blank -> null), [] for emptied skills", () => {
    const i = initial();
    expect(buildUpdatePayload(i, { ...i, link: "", location: "  ", salaryText: "", interviewAt: "", skillsText: "" })).toEqual({
      link: null, location: null, salaryText: null, interviewAt: null, skills: [],
    });
  });

  it("converts the interview with the browser's zone", () => {
    const i = initial();
    expect(buildUpdatePayload(i, { ...i, interviewAt: "2026-12-01T10:00" })).toEqual({ interviewAt: "2026-12-01T04:30:00.000Z" });
  });

  it("a new interview on an application that had none", () => {
    process.env.TZ = "Asia/Kolkata";
    const i = valuesFromApplication({ ...app, interviewAt: null });
    expect(buildUpdatePayload(i, { ...i, interviewAt: "2026-11-24T15:00" })).toEqual({ interviewAt: "2026-11-24T09:30:00.000Z" });
  });

  it("an empty form against empty values is a no-op", () => {
    expect(buildUpdatePayload(emptyApplicationValues, emptyApplicationValues)).toEqual({});
  });
});

describe("formatInterviewIST", () => {
  it("formats like 'Tue, 24 Nov, 3:00 pm' whatever the machine's zone is", () => {
    for (const tz of ["UTC", "America/New_York", "Asia/Kolkata"]) {
      process.env.TZ = tz;
      expect(formatInterviewIST(new Date("2026-11-24T09:30:00.000Z"))).toBe("Tue, 24 Nov, 3:00 pm");
    }
  });
  it("uses am for the morning and crosses midnight in IST", () => {
    expect(formatInterviewIST(new Date("2026-11-24T04:15:00.000Z"))).toBe("Tue, 24 Nov, 9:45 am");
    expect(formatInterviewIST(new Date("2026-11-24T20:00:00.000Z"))).toBe("Wed, 25 Nov, 1:30 am");
  });
});
