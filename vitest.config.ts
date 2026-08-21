import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths({ root: "." })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
});
