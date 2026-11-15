/**
 * Seeds ~100k applications for index/perf testing.
 *
 * !! NEVER run this against production. Create a Neon branch first
 *    (Neon dashboard -> Branches -> New branch "perf-test"), put ITS connection
 *    string in .env.local, then run:
 *
 *      npm run db:seed-perf -- --host=<host of the perf-test branch>
 *      npm run db:seed-perf -- --host=<host> --cleanup     (delete seeded rows)
 *
 * The --host flag must match the host in DATABASE_URL, so you have to read and
 * type the target on purpose. All seeded rows have company = 'seed-<n>'.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { STATUSES } from "../lib/statuses";

const ROWS = 100_000;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit?.includes("=") ? hit.split("=").slice(1).join("=") : hit ? "true" : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing");

  const host = new URL(url).host;
  console.log(`Target database host: ${host}`);

  if (arg("host") !== host) {
    throw new Error(
      `Refusing to run. Pass --host=${host} ONLY if this is your perf-test Neon branch, not production.`,
    );
  }

  const sql = neon(url);

  if (arg("cleanup")) {
    const deleted = await sql`DELETE FROM applications WHERE company LIKE 'seed-%' RETURNING id`;
    console.log(`Deleted ${deleted.length} seeded rows.`);
    return;
  }

  const [{ count: existing }] = await sql`SELECT count(*)::int AS count FROM applications WHERE company LIKE 'seed-%'`;
  if (existing > 0) {
    throw new Error(`${existing} seeded rows already exist. Run with --cleanup first.`);
  }

  const users = await sql`SELECT id FROM users ORDER BY id`;
  if (users.length === 0) throw new Error("No users in this database. Sign up at least one first.");
  const userIds = users.map((u) => u.id as number);
  console.log(`Spreading ${ROWS} rows across user ids: ${userIds.join(", ")}`);

  // Real user ids (foreign key), statuses spread across all 5 (so an index on
  // status is meaningful), created_at spread 1 minute apart over ~70 days.
  await sql`
    INSERT INTO applications (user_id, company, role, status, created_at)
    SELECT
      (${userIds}::int[])[1 + (g % ${userIds.length})],
      'seed-' || g,
      'Role ' || (g % 50),
      (${[...STATUSES]}::text[])[1 + (g % ${STATUSES.length})]::application_status,
      now() - (g || ' minutes')::interval
    FROM generate_series(1, ${ROWS}) AS g
  `;

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM applications`;
  console.log(`Done. applications now has ${count} rows.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
