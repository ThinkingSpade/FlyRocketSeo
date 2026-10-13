import { describe, expect, it } from "vitest";
import {
  createRuntimeIdentity,
  isolatedChildEnv,
  localDockerHost,
  requireIsolatedPostgres,
} from "../../scripts/postgres-runtime-isolation.mjs";

describe("PostgreSQL runtime isolation", () => {
  const database = "flyrocket_pg_test_0123456789abcdef0123456789abcdef";
  const safe = {
    FLYROCKET_PG_RUNTIME: "isolated-v1",
    FLYROCKET_PG_TEST_DATABASE: database,
    FLYROCKET_PG_TEST_URL: `postgres://flyrocket_test:isolated_test_password@127.0.0.1:15432/${database}`,
  };
  it("accepts only fake credentials and disposable loopback database identities", () => {
    expect(requireIsolatedPostgres(safe)).toBe(safe.FLYROCKET_PG_TEST_URL);
    const first = createRuntimeIdentity();
    expect(first.database).toMatch(/^flyrocket_pg_test_[a-f0-9]{32}$/);
    expect(createRuntimeIdentity().database).not.toBe(first.database);
  });
  it.each([
    { FLYROCKET_PG_RUNTIME: "" },
    { FLYROCKET_PG_TEST_DATABASE: "production" },
    {
      FLYROCKET_PG_TEST_URL: safe.FLYROCKET_PG_TEST_URL.replace(
        "127.0.0.1",
        "db.example.com",
      ),
    },
    {
      FLYROCKET_PG_TEST_URL: safe.FLYROCKET_PG_TEST_URL.replace(
        "flyrocket_test:",
        "admin:",
      ),
    },
    {
      FLYROCKET_PG_TEST_URL: safe.FLYROCKET_PG_TEST_URL.replace(
        "isolated_test_password",
        "real_secret",
      ),
    },
    { FLYROCKET_PG_TEST_URL: `${safe.FLYROCKET_PG_TEST_URL}?sslmode=require` },
    {
      FLYROCKET_PG_TEST_URL: safe.FLYROCKET_PG_TEST_URL.replace(
        ":15432/",
        ":543/",
      ),
    },
  ])("refuses unsafe or external configuration %j", (override) => {
    expect(() => requireIsolatedPostgres({ ...safe, ...override })).toThrow();
  });
  it("does not pass credentials or remote Docker settings into test subprocesses", () => {
    expect(
      isolatedChildEnv({
        PATH: "local-bin",
        DATABASE_URL: "secret",
        DATAFORSEO_API_KEY: "secret",
        DOCKER_HOST: "tcp://remote:2375",
        FLYROCKET_PG_TEST_URL: "secret",
      }),
    ).toEqual({ PATH: "local-bin" });
    expect(localDockerHost("win32")).toBe(
      "npipe:////./pipe/dockerDesktopLinuxEngine",
    );
    expect(localDockerHost("linux")).toBe("unix:///var/run/docker.sock");
  });
});
