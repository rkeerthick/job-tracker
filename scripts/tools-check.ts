/**
 * Runs the chat tools directly (no model, no HTTP) against the database in .env.local.
 * READ-ONLY: it only runs SELECTs.
 *
 *   npm run tools:check -- --user=3
 *   npm run tools:check -- --user=3 --expect-rows=1     (fails if upcoming_interviews(7) isn't 1 row)
 */
// Env is loaded by `tsx --env-file=.env.local` (see package.json), NOT by dotenv here:
// db/index.ts reads DATABASE_URL when it is first imported, which happens before any code below runs.
import { createChatTools } from "../lib/tools";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
  const userId = Number(arg("user") ?? 1);
  const expectRows = arg("expect-rows") === undefined ? undefined : Number(arg("expect-rows"));
  if (!Number.isInteger(userId) || userId < 1) throw new Error("--user must be a positive integer");

  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? "postgresql://missing").host}   user: ${userId}   (read-only)\n`);
  const tools = createChatTools(userId);
  let failed = false;

  const show = (label: string, value: unknown) => console.log(`${label}\n${JSON.stringify(value, null, 2)}\n`);

  const interviews = await tools.upcoming_interviews.run({ withinDays: 7 });
  show("upcoming_interviews({ withinDays: 7 })", interviews);
  if (expectRows !== undefined) {
    const n = "results" in interviews ? interviews.results.length : -1;
    const ok = n === expectRows;
    failed ||= !ok;
    console.log(`${ok ? "PASS" : "FAIL"}: expected ${expectRows} row(s), got ${n}\n`);
  }

  const tooFar = await tools.upcoming_interviews.run({ withinDays: 999 });
  show("upcoming_interviews({ withinDays: 999 })", tooFar);
  const errOk = "error" in tooFar && tooFar.error === "withinDays must be 1-30";
  failed ||= !errOk;
  console.log(`${errOk ? "PASS" : "FAIL"}: withinDays 999 returns { error: "withinDays must be 1-30" }\n`);

  const search = await tools.search_applications.run({ limit: 3 });
  show("search_applications({ limit: 3 })", search);

  const badLimit = await tools.search_applications.run({ limit: 0 });
  show("search_applications({ limit: 0 })", badLimit);

  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
