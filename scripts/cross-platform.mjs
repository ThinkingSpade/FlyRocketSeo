import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];

function executable(name) {
  const needsCommandShim = ["npm", "pnpm", "portless"].includes(name);
  return process.platform === "win32" && needsCommandShim
    ? `${name}.cmd`
    : name;
}

function needsWindowsShell(name) {
  return (
    process.platform === "win32" && ["npm", "pnpm", "portless"].includes(name)
  );
}

function run(name, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable(name), args, {
      cwd: repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
      shell: needsWindowsShell(name),
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(
        new Error(
          signal
            ? `${name} was terminated by ${signal}`
            : `${name} exited with code ${code ?? 1}`,
        ),
      );
    });
  });
}

async function runDevAgents(force) {
  const logsDirectory = resolve(repoRoot, ".logs");
  mkdirSync(logsDirectory, { recursive: true });
  const log = createWriteStream(resolve(logsDirectory, "dev-server.log"), {
    flags: "w",
  });
  const args = force
    ? ["--force", "run", "vite", "dev"]
    : ["run", "vite", "dev"];
  const child = spawn(executable("portless"), args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    shell: needsWindowsShell("portless"),
  });

  const forward = (chunk) => {
    process.stdout.write(chunk);
    log.write(chunk);
  };
  child.stdout.on("data", forward);
  child.stderr.on("data", forward);

  const stop = () => child.kill("SIGINT");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await new Promise((resolveRun, rejectRun) => {
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      log.end();
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") {
        resolveRun();
        return;
      }
      rejectRun(new Error(`portless exited with code ${code ?? 1}`));
    });
  });
}

async function main() {
  if (command === "perf-startup") {
    rmSync(resolve(repoRoot, "dist-sourcemaps"), {
      recursive: true,
      force: true,
    });
    await run("node", ["scripts/build.mjs"], {
      env: {
        ...process.env,
        AUTH_MODE: "hosted",
        POSTHOG_SOURCEMAPS: "true",
      },
    });
    await run("node", ["scripts/measure-startup-bundle.mjs"]);
    return;
  }

  if (command === "clear-dev-chat") {
    for (const directory of [
      ".wrangler/state/v3/do/flyrocketseo-OnboardingChatAgent",
      ".wrangler/state/v3/do/flyrocketseo-SamChatAgent",
    ]) {
      rmSync(resolve(repoRoot, directory), { recursive: true, force: true });
    }
    return;
  }

  if (command === "dev-agents") {
    await runDevAgents(process.argv.includes("--force"));
    return;
  }

  if (command === "upload-sourcemaps") {
    await run("npm", ["run", "build"], {
      env: {
        ...process.env,
        POSTHOG_SOURCEMAPS: "true",
        NODE_OPTIONS: "--max-old-space-size=8192",
      },
    });
    await run("pnpm", [
      "dlx",
      "@posthog/cli",
      "sourcemap",
      "inject",
      "--directory",
      "./dist-sourcemaps",
    ]);
    await run("pnpm", [
      "dlx",
      "@posthog/cli",
      "sourcemap",
      "upload",
      "--directory",
      "./dist-sourcemaps",
    ]);
    return;
  }

  throw new Error(`Unknown cross-platform command: ${command ?? "(missing)"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
