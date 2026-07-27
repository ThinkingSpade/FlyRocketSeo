import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3101",
    actionTimeout: 5_000,
    navigationTimeout: 30_000,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    // Env vars live in `env` (not inlined into `command`) so this spawns the
    // same way on POSIX shells and Windows: an inline `VAR=val cmd` prefix is
    // bash/sh syntax, but Node's `shell: true` spawn uses cmd.exe on Windows
    // regardless of what shell launched the test runner itself, and cmd.exe
    // cannot parse that prefix (it tries to run "NODE_OPTIONS=" as a program).
    command: "pnpm exec vite dev --host 127.0.0.1 --strictPort",
    env: {
      NODE_OPTIONS: "",
      AUTH_MODE: "local_noauth",
      VITE_E2E_DOMAIN_FIXTURES: "1",
      VITE_E2E_KEYWORD_FIXTURES: "1",
      PORT: "3101",
    },
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
