import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./acceptance",
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: fileURLToPath(
          new URL("../test-results/acceptance-summary.json", import.meta.url),
        ),
      },
    ],
  ],
  outputDir: "../test-results/acceptance",
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    baseURL: "http://localhost:3102",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    command: "node scripts/acceptance-server.mjs",
    url: "http://localhost:3102",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
