import { describe, expect, it } from "vitest";
import { checkE2eDatabaseUrl } from "../e2e/env";

const REAL = "postgresql://u:p@ep-real-main-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const E2E = "postgresql://u:p@ep-e2e-branch-456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("e2e database guard: e2e tests must never be able to reach the real database", () => {
  it("refuses to run when E2E_DATABASE_URL is missing or empty", () => {
    expect(() => checkE2eDatabaseUrl(undefined, REAL)).toThrow(/E2E_DATABASE_URL is not set/);
    expect(() => checkE2eDatabaseUrl("", REAL)).toThrow(/E2E_DATABASE_URL is not set/);
  });

  it("refuses an identical URL", () => {
    expect(() => checkE2eDatabaseUrl(REAL, REAL)).toThrow(/same database/);
  });

  it("refuses the same database reached through the direct (non-pooled) host", () => {
    const direct = REAL.replace("-pooler", "");
    expect(() => checkE2eDatabaseUrl(direct, REAL)).toThrow(/same database/);
    expect(() => checkE2eDatabaseUrl(REAL, direct)).toThrow(/same database/);
  });

  it("refuses the same host even with different credentials or database name", () => {
    expect(() => checkE2eDatabaseUrl(REAL.replace("u:p", "other:secret").replace("/neondb", "/other"), REAL)).toThrow(/same database/);
  });

  it("refuses something that is not a URL", () => {
    expect(() => checkE2eDatabaseUrl("not a url", REAL)).toThrow(/not a valid/);
  });

  it("accepts a genuinely different branch, and returns it unchanged", () => {
    expect(checkE2eDatabaseUrl(E2E, REAL)).toBe(E2E);
  });

  it("accepts it when there is no DATABASE_URL to compare with", () => {
    expect(checkE2eDatabaseUrl(E2E, undefined)).toBe(E2E);
  });
});
