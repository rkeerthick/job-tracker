import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Resolves the "@/*" alias from tsconfig.json, so "@/lib/..." imports work in tests.
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // Playwright specs live in e2e/ and are run by `npm run e2e`, not by Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Dummy URL so modules that import "@/db" can load. Tests build SQL but never connect to a database.
    env: { DATABASE_URL: "postgresql://user:pass@localhost/db" },
  },
});
