import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  createRuntimeIdentity,
  isolatedChildEnv,
  localDockerHost,
  TEST_PASSWORD,
  TEST_USER,
} from "./postgres-runtime-isolation.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const identity = createRuntimeIdentity();
const runDir = join(
  workspace,
  ".tmp",
  "postgres-runtime",
  "runs",
  identity.name,
);
const childEnv = isolatedChildEnv();
const dockerArgs = ["--host", localDockerHost()];
const label = "flyrocketseo.isolated-postgres";
// Public official multi-architecture manifest for postgres:17-alpine, read from
// Docker Hub on 2026-10-13. Record the actual server version in every run.
const image =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const nativeBin =
  process.argv[2] === "--native-bin" ? process.argv[3] : undefined;
if (
  process.argv.length > (nativeBin ? 4 : 2) ||
  (process.argv[2] && !nativeBin)
) {
  throw new Error(
    "Usage: node scripts/postgres-runtime.mjs [--native-bin .tmp/postgres-runtime/<version>/pgsql/bin]",
  );
}
function insideWorkspace(path) {
  const offset = relative(workspace, resolve(path));
  if (offset.startsWith("..") || isAbsolute(offset))
    throw new Error("Test runtime state must remain inside the workspace.");
  return resolve(path);
}
function execute(command, args, timeout = 30000, stdio = "pipe") {
  const result = spawnSync(command, args, {
    cwd: workspace,
    env: childEnv,
    encoding: "utf8",
    timeout,
    windowsHide: true,
    stdio,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args[0]} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`,
    );
  return result.stdout?.trim() ?? "";
}
function docker(args, timeout) {
  return execute("docker", [...dockerArgs, ...args], timeout);
}
async function freePort() {
  const server = createServer();
  await new Promise((success, failure) => {
    server.once("error", failure);
    server.listen(0, "127.0.0.1", success);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No isolated port available.");
  await new Promise((success, failure) =>
    server.close((error) => (error ? failure(error) : success())),
  );
  return address.port;
}
async function tests(url) {
  const env = {
    ...childEnv,
    FLYROCKET_PG_RUNTIME: "isolated-v1",
    FLYROCKET_PG_TEST_DATABASE: identity.database,
    FLYROCKET_PG_TEST_URL: url,
  };
  const code = await new Promise((success, failure) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "e2e/postgres.config.ts",
        "--maxWorkers=1",
      ],
      { cwd: workspace, env, stdio: "inherit", windowsHide: true },
    );
    child.once("error", failure);
    child.once("exit", (status) => success(status ?? 1));
  });
  if (code !== 0) throw new Error(`PostgreSQL runtime tests failed (${code}).`);
}
await mkdir(runDir, { recursive: true });
await writeFile(join(runDir, "identity.json"), JSON.stringify(identity));
let nativeStarted = false;
let containerStarted = false;
let sql;
try {
  let port;
  if (nativeBin) {
    const bin = insideWorkspace(nativeBin);
    const data = insideWorkspace(join(runDir, "data"));
    const passwordFile = join(runDir, "test-password.txt");
    await writeFile(passwordFile, TEST_PASSWORD, { mode: 0o600 });
    execute(
      join(bin, "initdb.exe"),
      [
        "-D",
        data,
        "-U",
        TEST_USER,
        "--auth=scram-sha-256",
        `--pwfile=${passwordFile}`,
        "--encoding=UTF8",
        "--locale=C",
      ],
      60000,
    );
    port = await freePort();
    nativeStarted = true;
    execute(
      join(bin, "pg_ctl.exe"),
      [
        "start",
        "-D",
        data,
        "-l",
        join(runDir, "server.log"),
        "-o",
        `-h 127.0.0.1 -p ${port} -c max_connections=32 -c shared_buffers=32MB -c fsync=off`,
        "-w",
        "-t",
        "30",
      ],
      45000,
      "ignore",
    );
  } else {
    docker(["version", "--format", "{{.Server.Version}}"], 15000);
    docker(
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        identity.name,
        "--label",
        `${label}=${identity.database}`,
        "--memory=512m",
        "--cpus=1",
        "--read-only",
        "--publish",
        "127.0.0.1::5432",
        "--tmpfs",
        "/var/lib/postgresql/data:rw,size=256m",
        "--tmpfs",
        "/var/run/postgresql:rw,size=16m",
        "--tmpfs",
        "/tmp:rw,size=16m",
        "--env",
        `POSTGRES_USER=${TEST_USER}`,
        "--env",
        `POSTGRES_PASSWORD=${TEST_PASSWORD}`,
        "--env",
        `POSTGRES_DB=${identity.database}`,
        image,
      ],
      180000,
    );
    containerStarted = true;
    const binding = docker(["port", identity.name, "5432/tcp"]);
    if (!/^127\.0\.0\.1:\d+$/.test(binding))
      throw new Error("Refusing non-loopback Docker port binding.");
    port = Number(binding.split(":")[1]);
  }
  const adminUrl = `postgres://${TEST_USER}:${TEST_PASSWORD}@127.0.0.1:${port}/${nativeBin ? "postgres" : identity.database}`;
  sql = postgres(adminUrl, { max: 1, connect_timeout: 2, fetch_types: false });
  for (let attempt = 0; ; attempt++) {
    try {
      await sql`select 1`;
      break;
    } catch (error) {
      if (attempt >= 20) throw error;
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  if (nativeBin) await sql.unsafe(`CREATE DATABASE "${identity.database}"`);
  const version = (await sql`select version() AS version`)[0].version;
  await writeFile(
    join(runDir, "runtime.json"),
    JSON.stringify(
      {
        version,
        backend: nativeBin ? "native" : "docker",
        loopback: "127.0.0.1",
        database: identity.database,
      },
      null,
      2,
    ),
  );
  console.log(`Isolated PostgreSQL runtime: ${version}`);
  await tests(
    `postgres://${TEST_USER}:${TEST_PASSWORD}@127.0.0.1:${port}/${identity.database}`,
  );
} finally {
  if (sql) await sql.end({ timeout: 2 });
  if (nativeStarted) {
    const marker = JSON.parse(
      await readFile(join(runDir, "identity.json"), "utf8"),
    );
    if (marker.database !== identity.database)
      throw new Error("Refusing to stop an unrecognized database.");
    execute(
      join(insideWorkspace(nativeBin), "pg_ctl.exe"),
      [
        "stop",
        "-D",
        insideWorkspace(join(runDir, "data")),
        "-m",
        "fast",
        "-w",
        "-t",
        "30",
      ],
      45000,
    );
  }
  if (containerStarted) {
    const marker = docker([
      "inspect",
      "--format",
      `{{index .Config.Labels "${label}"}}`,
      identity.name,
    ]);
    if (marker !== identity.database)
      throw new Error("Refusing to remove an unrecognized container.");
    docker(["rm", "--force", identity.name]);
  }
}
