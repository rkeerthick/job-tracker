import { existsSync } from "node:fs";

/**
 * The ONE place that decides whether an e2e run is allowed. Used by playwright.config.ts, the
 * DB helper and the teardown, so none of them can touch the real database by accident.
 */

// Neon names a branch's compute endpoint in the host: "ep-xxxx-pooler.region.aws.neon.tech".
// Pooled and direct URLs of the same branch differ only by "-pooler".
const endpointOf = (url: string) => new URL(url).host.replace("-pooler", "");

/**
 * Pure decision: is `e2e` a database we may run e2e tests against? Returns it, or throws.
 * (Separate from the env loading so it can be unit-tested.)
 */
export function checkE2eDatabaseUrl(e2e: string | undefined, real: string | undefined): string {
  if (!e2e) {
    throw new Error(
      "E2E_DATABASE_URL is not set, so the e2e tests will NOT run (they would hit the real database).\n" +
        "Create a Neon branch named 'e2e' and add its connection string to .env.local as E2E_DATABASE_URL=...",
    );
  }

  let e2eEndpoint: string;
  try {
    e2eEndpoint = endpointOf(e2e);
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid connection string.");
  }

  if (real) {
    let realEndpoint: string | undefined;
    try { realEndpoint = endpointOf(real); } catch { /* an unparsable DATABASE_URL can't be the e2e database */ }
    if (e2e === real || e2eEndpoint === realEndpoint) {
      throw new Error("E2E_DATABASE_URL points at the same database as DATABASE_URL. Refusing to run e2e tests against it.");
    }
  }
  return e2e;
}

export function requireE2eDatabaseUrl(): string {
  // Playwright does not read .env.local on its own.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local"); // never overrides variables that are already set

  const e2e = checkE2eDatabaseUrl(process.env.E2E_DATABASE_URL, process.env.DATABASE_URL);

  // Nothing in this process tree (the test runner, workers) may see the real URL.
  // The app server gets the e2e URL explicitly via webServer.env.
  delete process.env.DATABASE_URL;
  return e2e;
}
