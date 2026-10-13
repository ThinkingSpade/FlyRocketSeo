import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, readdirSync } from "node:fs";
import path from "node:path";

// Do not inherit .env.local keys or Cloudflare account credentials. Vite uses
// the dedicated empty envDir and the test Wrangler file contains fake auth
// configuration only. A fresh state path is chosen for every server launch.
const taskRoot = process.cwd();
if (
  readdirSync(path.join(taskRoot, "e2e", "acceptance")).some((name) =>
    /^(?:\.env|\.dev\.vars)(?:\.|$)/u.test(name),
  )
) {
  throw new Error(
    "Acceptance fixtures must not contain .env or .dev.vars files",
  );
}
const statePath = path.join(
  taskRoot,
  "test-results",
  "acceptance-state",
  `${Date.now()}`,
);
mkdirSync(statePath, { recursive: true });
const log = createWriteStream(
  path.join(taskRoot, "test-results", "acceptance-server.log"),
);
function mirror(child) {
  child.stdout.on("data", (chunk) => {
    log.write(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    log.write(chunk);
    process.stderr.write(chunk);
  });
}
const taskEnv = {};
for (const key of [
  "PATH",
  "Path",
  "SystemRoot",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "LOCALAPPDATA",
  "APPDATA",
  "COMSPEC",
  "ComSpec",
  "PATHEXT",
]) {
  if (process.env[key]) taskEnv[key] = process.env[key];
}
Object.assign(taskEnv, {
  NODE_OPTIONS: "",
  AUTH_MODE: "hosted",
  PORT: "3102",
  FLYROCKET_ACCEPTANCE: "1",
  FLYROCKET_ACCEPTANCE_STATE: statePath,
  XDG_CONFIG_HOME: path.join(statePath, "config"),
  WRANGLER_LOG_PATH: path.join(statePath, "wrangler.log"),
  WRANGLER_SEND_METRICS: "false",
  VITE_SHOW_DEVTOOLS: "false",
  VITE_E2E_DOMAIN_FIXTURES: "1",
  VITE_E2E_KEYWORD_FIXTURES: "1",
});
const seed = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "e2e/acceptance/seed.ts"],
  { cwd: taskRoot, env: taskEnv, stdio: ["ignore", "pipe", "pipe"] },
);
mirror(seed);
seed.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "dev",
      "--mode",
      "acceptance",
      "--host",
      "127.0.0.1",
      "--strictPort",
    ],
    { cwd: taskRoot, env: taskEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  mirror(server);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.kill(signal));
  server.on("exit", (serverCode) => process.exit(serverCode ?? 0));
});
