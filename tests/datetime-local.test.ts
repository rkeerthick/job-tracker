import { afterEach, describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso } from "@/lib/datetime-local";

// The functions use the process time zone, exactly like the browser. Switch it per test.
const original = process.env.TZ;
afterEach(() => { process.env.TZ = original; if (original === undefined) delete process.env.TZ; });
const inZone = (tz: string, fn: () => void) => { process.env.TZ = tz; fn(); };

describe("datetime-local helpers", () => {
  it("India (UTC+5:30): the input value is local time, the API value is UTC", () => {
    inZone("Asia/Kolkata", () => {
      expect(localInputToIso("2026-11-24T15:00")).toBe("2026-11-24T09:30:00.000Z");
      expect(isoToLocalInput("2026-11-24T09:30:00.000Z")).toBe("2026-11-24T15:00");
    });
  });

  it("does not show UTC in the input (the classic bug)", () => {
    inZone("Asia/Kolkata", () => {
      expect(isoToLocalInput("2026-11-24T09:30:00.000Z")).not.toBe("2026-11-24T09:30");
    });
  });

  it("crosses midnight correctly (local date differs from the UTC date)", () => {
    inZone("Asia/Kolkata", () => {
      expect(isoToLocalInput("2026-11-24T20:00:00.000Z")).toBe("2026-11-25T01:30");
      expect(localInputToIso("2026-11-25T01:30")).toBe("2026-11-24T20:00:00.000Z");
    });
  });

  it.each(["Asia/Kolkata", "UTC", "America/New_York", "Pacific/Auckland", "Asia/Kathmandu", "America/St_Johns"])(
    "round trip ISO -> input -> ISO is the same instant in %s",
    (tz) => {
      inZone(tz, () => {
        // minute-aligned instants, away from the daylight-saving changeover hour (which is ambiguous by nature)
        for (const iso of ["2026-01-15T03:45:00.000Z", "2026-07-04T18:00:00.000Z", "2026-11-24T09:30:00.000Z", "2099-12-31T23:59:00.000Z", "2000-01-01T00:00:00.000Z"]) {
          const input = isoToLocalInput(iso);
          expect(input).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
          expect(localInputToIso(input)).toBe(iso);
        }
      });
    },
  );

  it("accepts an offset ISO from the API (+05:30) and shows the right local time", () => {
    inZone("Asia/Kolkata", () => {
      expect(isoToLocalInput("2026-12-01T10:00:00+05:30")).toBe("2026-12-01T10:00");
    });
  });

  it("empty, null and invalid values map to empty / null, never throw", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("not a date")).toBeNull();
    expect(isoToLocalInput("")).toBe("");
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput(undefined)).toBe("");
    expect(isoToLocalInput("garbage")).toBe("");
  });

  it("drops seconds (the input works in minutes)", () => {
    inZone("UTC", () => {
      expect(isoToLocalInput("2026-11-24T09:30:45.123Z")).toBe("2026-11-24T09:30");
    });
  });
});
