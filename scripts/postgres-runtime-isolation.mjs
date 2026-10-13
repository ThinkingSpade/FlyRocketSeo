import { randomUUID } from "node:crypto";

export const TEST_USER = "flyrocket_test";
export const TEST_PASSWORD = "isolated_test_password";

export function createRuntimeIdentity() {
  const suffix = randomUUID().replaceAll("-", "");
  return {
    name: `flyrocket-pg-test-${suffix}`,
    database: `flyrocket_pg_test_${suffix}`,
  };
}

export function requireIsolatedPostgres(env) {
  if (env.FLYROCKET_PG_RUNTIME !== "isolated-v1") {
    throw new Error(
      "Run PostgreSQL tests through scripts/postgres-runtime.mjs.",
    );
  }
  const database = env.FLYROCKET_PG_TEST_DATABASE;
  if (!/^flyrocket_pg_test_[a-f0-9]{32}$/.test(database ?? "")) {
    throw new Error(
      "PostgreSQL runtime tests require a disposable database identity.",
    );
  }
  const url = new URL(env.FLYROCKET_PG_TEST_URL ?? "");
  if (
    url.protocol !== "postgres:" ||
    url.hostname !== "127.0.0.1" ||
    !/^\d+$/.test(url.port) ||
    Number(url.port) < 1024 ||
    Number(url.port) > 65535 ||
    url.username !== TEST_USER ||
    url.password !== TEST_PASSWORD ||
    url.pathname !== `/${database}` ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "PostgreSQL runtime tests refuse non-isolated connection settings.",
    );
  }
  return url.href;
}

export function localDockerHost(platform = process.platform) {
  return platform === "win32"
    ? "npipe:////./pipe/dockerDesktopLinuxEngine"
    : "unix:///var/run/docker.sock";
}

/** @param {Record<string, string | undefined>} source */
export function isolatedChildEnv(source = process.env) {
  const allowed =
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|CI|NO_COLOR)$/i;
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.test(key)),
  );
}
