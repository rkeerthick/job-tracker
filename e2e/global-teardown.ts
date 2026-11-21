import { e2eSql } from "./db";

// Every test user is e2e+<timestamp>@example.com. Deleting the users cascades to their sessions,
// applications and notes. The e2e database is isolated, so this is housekeeping, not safety.
export default async function globalTeardown() {
  const removed = await e2eSql()`DELETE FROM users WHERE email LIKE 'e2e+%' RETURNING id`;
  console.log(`e2e teardown: removed ${removed.length} test user(s) from the e2e database`);
}
