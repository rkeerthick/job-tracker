import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Resolves the "@/*" alias from tsconfig.json, so "@/lib/..." imports work in tests.
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
