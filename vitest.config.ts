import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Resolves the "@/*" alias from tsconfig.json, so "@/lib/..." imports work in tests.
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // Dummy URL so modules that import "@/db" can load. Tests build SQL but never connect to a database.
    env: { DATABASE_URL: "postgresql://user:pass@localhost/db" },
  },
});
