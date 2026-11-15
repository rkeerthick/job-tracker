import { createHash } from "node:crypto";

// The raw token lives only in the cookie; the DB stores its SHA-256 hash,
// so a leaked sessions table can't be used to hijack sessions.
// SHA-256 (not bcrypt) because the token is already 256 bits of randomness
// and we need a deterministic hash to look it up by index.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
