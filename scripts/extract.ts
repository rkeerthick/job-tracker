/**
 * Extract structured fields from a job posting with Groq.
 *
 *   npm run extract -- path/to/posting.txt
 *   npm run extract -- "Frontend Developer at Acme, Bengaluru ..."
 *   cat posting.txt | npm run extract
 *   npm run extract -- --break-first posting.txt    (forces the retry path: first output is garbage)
 *
 * Needs GROQ_API_KEY in .env.local. Prints JSON: { ok: true, data } or { ok: false, error }.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync } from "node:fs";
import { extractWithRetry } from "../lib/extract-job";
import { callGroq, GroqError, withBrokenFirstCall } from "../lib/groq";

async function readInput(args: string[]): Promise<string> {
  const arg = args.join(" ").trim();
  if (arg) return existsSync(arg) ? readFileSync(arg, "utf8") : arg; // file path, else the text itself
  if (process.stdin.isTTY) throw new Error("Pass a file path, the posting text, or pipe text on stdin.");
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const breakFirst = args.includes("--break-first");
  const text = (await readInput(args.filter((a) => a !== "--break-first"))).trim();
  if (!text) throw new Error("Job posting text is empty.");

  const result = await extractWithRetry(text, breakFirst ? withBrokenFirstCall(callGroq) : callGroq);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e, e instanceof GroqError ? e.detail : "");
  process.exit(2);
});
