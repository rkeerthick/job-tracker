/**
 * Runs every scripts/fixtures/*.txt through the extractor and checks the ones listed in expect.json.
 *   npm run extract:check
 * Real posts you add as extra .txt files are printed (not asserted) so you can eyeball them.
 * Uses the Groq API: needs GROQ_API_KEY in .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractWithRetry, type ExtractResult } from "../lib/extract-job";
import { callGroq, GroqError, groqMode, withBrokenFirstCall } from "../lib/groq";

type Expect = {
  companyIncludes?: string; roleIncludes?: string; locationIncludes?: string;
  /** null = the post has no salary figure, so salaryText MUST be null (proves no guessing). */
  salaryText?: null;
  /** Substrings salaryText must contain, e.g. ["25", "35"]. Not an exact match: the model may reformat slightly. */
  salaryContains?: string[];
  skillsInclude?: string[];
  /** Prompt-injection guard: none of these strings may appear ANYWHERE in the output. */
  outputExcludes?: string[];
};

const dir = join(process.cwd(), "scripts", "fixtures");
const expectations = JSON.parse(readFileSync(join(dir, "expect.json"), "utf8")) as Record<string, Expect>;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ""); // "Node.js" == "node js" == "nodejs"

function check(file: string, r: ExtractResult, e: Expect): string[] {
  if (!r.ok) return [`extraction failed: ${r.error}`];
  const d = r.data, fails: string[] = [];
  const has = (v: string | null, needle?: string) => needle === undefined || (v ?? "").toLowerCase().includes(needle);
  if (!has(d.company, e.companyIncludes)) fails.push(`company "${d.company}" lacks "${e.companyIncludes}"`);
  if (!has(d.role, e.roleIncludes)) fails.push(`role "${d.role}" lacks "${e.roleIncludes}"`);
  if (!has(d.location, e.locationIncludes)) fails.push(`location ${JSON.stringify(d.location)} lacks "${e.locationIncludes}"`);
  if (e.salaryText === null && d.salaryText !== null) {
    fails.push(`salaryText should be null (no salary in the post) but got ${JSON.stringify(d.salaryText)}`);
  }
  if (e.salaryContains) {
    if (d.salaryText === null) fails.push("salaryText is null but the post states a salary");
    else for (const part of e.salaryContains) {
      if (!d.salaryText.includes(part)) fails.push(`salaryText ${JSON.stringify(d.salaryText)} missing "${part}"`);
    }
  }
  for (const bad of e.outputExcludes ?? []) {
    if (JSON.stringify(d).toLowerCase().includes(bad.toLowerCase())) fails.push(`output contains "${bad}": the model followed an instruction hidden in the post`);
  }
  const got = d.skills.map(norm);
  for (const s of e.skillsInclude ?? []) if (!got.includes(s)) fails.push(`skill "${s}" missing (got ${JSON.stringify(d.skills)})`);
  return fails;
}

// Heuristic only: flags a possible FALSE NEGATIVE (model said null but the post seems to state a salary).
const SALARY_LIKE = /(₹|\brs\.?|\binr|\$|€|£)\s?\d|\d\s?(lpa|lakhs?|k\b|per\s+(annum|year|month))|\bctc\b\W{0,3}\d/i;

async function main() {
  const only = process.argv.slice(2); // optional file names: npm run extract:check -- injection.txt
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt") && (only.length === 0 || only.includes(f))).sort();
  let failed = 0;

  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const r = await extractWithRetry(text, callGroq);
    const e = expectations[f];
    const fails = e ? check(f, r, e) : [];
    if (fails.length) failed++;
    console.log(`\n=== ${f}  [${e ? (fails.length ? "FAIL" : "PASS") : "no expectations, eyeball it"}]  attempts=${r.attempts}`);
    console.log(JSON.stringify(r.ok ? r.data : { error: r.error, rawOutput: r.rawOutput }, null, 2));
    for (const x of fails) console.log("  ✗", x);
    const hint = r.ok && r.data.salaryText === null ? text.match(SALARY_LIKE)?.[0] : undefined;
    if (hint) console.log(`  ⚠ salaryText is null but the post contains something salary-like: "${hint}" (possible false negative)`);
  }

  if (only.length > 0) {
    console.log(`
Mode used: ${groqMode()}
${failed ? `${failed} check(s) FAILED` : "All selected checks passed"}`);
    process.exit(failed ? 1 : 0);
  }

  // Retry path, for real: first output is garbage, the second call must produce valid output.
  const retry = await extractWithRetry(readFileSync(join(dir, "structured.txt"), "utf8"), withBrokenFirstCall(callGroq));
  const retryOk = retry.ok && retry.attempts === 2;
  if (!retryOk) failed++;
  console.log(`\n=== retry path (first output forced broken)  [${retryOk ? "PASS" : "FAIL"}]  attempts=${retry.attempts}${retry.ok ? "" : "  error=" + retry.error}`);

  console.log(`\nMode used: ${groqMode()}\n${failed ? `${failed} check(s) FAILED` : "All checks passed"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e, e instanceof GroqError ? e.detail : ""); process.exit(2); });
