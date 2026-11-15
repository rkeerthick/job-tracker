import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/token";

describe("passwords (bcrypt)", () => {
  it("hashes to something other than the plain password and verifies correctly", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).not.toBe("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  }, 15_000); // bcrypt cost 12 is deliberately slow
});

describe("hashToken (SHA-256 hex)", () => {
  it("is deterministic: same input -> same output", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("different input -> different output", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("matches the known SHA-256 of 'abc' and never equals the raw token", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});
