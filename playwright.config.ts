import { defineConfig, devices } from "@playwright/test";
import { requireE2eDatabaseUrl } from "./e2e/env";

// Throws unless E2E_DATABASE_URL is set to a database that is NOT the real one: a run can never touch real data.
const e2eDatabaseUrl = requireE2eDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // one shared database: tests run one after another
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // In CI also write an HTML report (uploaded as an artifact when the job fails).
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL: "http://localhost:3100", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, not `next dev`: Next allows only ONE dev server per project folder, so
    // `next dev -p 3100` fails to start whenever your normal dev server (port 3000) is running.
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100/login",
    // Never reuse a server that is already running: it could be connected to the real database.
    reuseExistingServer: false,
    timeout: 240_000, // includes the build
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      E2E_DATABASE_URL: e2eDatabaseUrl,
      GROQ_API_KEY: "e2e-disabled", // chat is mocked; if a request ever escaped the mock it would fail instead of spending credits
    },
  },
});
