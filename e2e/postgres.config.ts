import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // These tests must never read .env.local or any production provider settings.
  envDir: false,
  plugins: [tsConfigPaths()],
  resolve: {
    alias: {
      "cloudflare:workers": fileURLToPath(
        new URL("./postgres/worker-env.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["e2e/postgres/**/*.runtime.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    restoreMocks: true,
    clearMocks: true,
    reporters: ["default", "json"],
    outputFile: { json: "test-results/postgres-runtime/summary.json" },
  },
});
