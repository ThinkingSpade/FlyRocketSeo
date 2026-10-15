import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the REAL repositories against a real SQLite engine (node:sqlite) built
// from the real drizzle/*.sql migrations, so what is proven here is the SQL a
// D1 query actually executes -- the upsert's conflict target and WHERE, the
// city filters, the cap -- not a mock's idea of it.

vi.mock("cloudflare:workers", () => ({ env: {} }));

type Param = string | number | bigint | null | Uint8Array;

const helpers = vi.hoisted(() => ({
  toParams: (params: unknown[]): Param[] =>
    params.map((value) => {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "bigint" ||
        value instanceof Uint8Array
      )
        return value;
      if (typeof value === "boolean") return value ? 1 : 0;
      throw new Error(`Unsupported SQLite parameter of type ${typeof value}`);
    }),
}));

vi.mock("@/db", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");

  const sqlite = new DatabaseSync(":memory:");
  const dir = path.join(process.cwd(), "drizzle");
  for (const file of fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .toSorted()) {
    sqlite.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  // After the migrations, which switch foreign keys back on: these tests are
  // about project_subdomains, and seeding full projects rows is only noise.
  sqlite.exec("PRAGMA foreign_keys = OFF");

  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    const bound = helpers.toParams(params);
    if (method === "run") {
      statement.run(...bound);
      return { rows: [] };
    }
    const rows = statement.all(...bound).map((row) => Object.values(row));
    return { rows: method === "get" ? (rows[0] ?? []) : rows };
  });
  return { db, sqlite };
});

vi.mock("@/db/runBatch", async () => {
  const { db } = await import("@/db");
  return {
    executeInBatches: async <T>(
      items: T[],
      build: (tx: typeof db, item: T) => Promise<unknown>,
    ) => {
      for (const item of items) await build(db, item);
    },
  };
});

import { db } from "@/db";
import { projectSubdomains } from "@/db/schema";
import { MAX_SUBDOMAINS_PER_PROJECT } from "@/shared/project-subdomains";
import { ProjectSubdomainRepository } from "@/server/features/projects/repositories/ProjectSubdomainRepository";
import { CitySiteRepository, type CitySiteInsert } from "./CitySiteRepository";

const PROJECT = "project_a";
const OTHER_PROJECT = "project_b";

function city(host: string, overrides: Partial<CitySiteInsert> = {}) {
  const label = host.split(".")[0] ?? host;
  return {
    host,
    subdomainLabel: label,
    cityName: label[0]?.toUpperCase() + label.slice(1),
    stateCode: "TX",
    locationCode: 1_000_000 + host.length,
    parentMetroCode: 200_623,
    matchStatus: "matched" as const,
    ...overrides,
  };
}

async function allRows() {
  return db.select().from(projectSubdomains);
}

async function discover(projectId: string, host: string) {
  await ProjectSubdomainRepository.insertMany(projectId, [
    {
      host,
      source: "gsc",
      metrics: {
        organicKeywords: null,
        organicTraffic: null,
        clicks: 12,
        impressions: 300,
      },
      lastSeenAt: "2026-10-15 00:00:00",
    },
  ]);
}

beforeEach(async () => {
  await db.delete(projectSubdomains);
});

describe("CitySiteRepository on the shared host list", () => {
  it("adds hosts the project did not have as city sites", async () => {
    const result = await CitySiteRepository.insertMany(PROJECT, [
      city("austin.example.com"),
      city("dallas.example.com", {
        cityName: null,
        stateCode: null,
        locationCode: null,
        parentMetroCode: null,
        matchStatus: "ambiguous",
      }),
    ]);

    expect(result).toEqual({ imported: 2, skippedForCap: 0 });
    const rows = await allRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.source === "manual")).toBe(true);
    expect(await CitySiteRepository.countsByStatus(PROJECT)).toEqual({
      matched: 1,
      ambiguous: 1,
      unmatched: 0,
    });
  });

  it("turns a discovered host into a city site without duplicating it", async () => {
    await discover(PROJECT, "austin.example.com");
    const [before] = await allRows();

    await CitySiteRepository.insertMany(PROJECT, [city("austin.example.com")]);

    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: before?.id,
      // Discovery's provenance and metrics survive; the city is added.
      source: "gsc",
      clicks: 12,
      cityName: "Austin",
      cityMatchStatus: "matched",
      cityMatchSource: "auto",
    });
  });

  it("never overwrites a city an operator chose by hand", async () => {
    await CitySiteRepository.insertMany(PROJECT, [
      city("springfield.example.com", {
        locationCode: null,
        matchStatus: "ambiguous",
      }),
    ]);
    const [row] = await CitySiteRepository.listPage({
      projectId: PROJECT,
      limit: 10,
      offset: 0,
    }).then((page) => page.rows);
    await CitySiteRepository.setLocation({
      projectId: PROJECT,
      citySiteId: row?.id ?? "",
      cityName: "Springfield",
      stateCode: "IL",
      locationCode: 1_016_367,
      parentMetroCode: null,
    });

    // A re-import that would auto-match it somewhere else.
    await CitySiteRepository.insertMany(PROJECT, [
      city("springfield.example.com", { stateCode: "MO", locationCode: 9 }),
    ]);

    const [after] = await allRows();
    expect(after).toMatchObject({
      stateCode: "IL",
      locationCode: 1_016_367,
      cityMatchSource: "manual",
    });
  });

  it("lists, counts and resolves ids for city sites only", async () => {
    await discover(PROJECT, "blog.example.com");
    await CitySiteRepository.insertMany(PROJECT, [city("austin.example.com")]);
    await CitySiteRepository.insertMany(OTHER_PROJECT, [
      city("houston.other.com"),
    ]);

    const page = await CitySiteRepository.listPage({
      projectId: PROJECT,
      limit: 10,
      offset: 0,
    });
    expect(page.rows.map((row) => row.host)).toEqual(["austin.example.com"]);
    expect(page.totalCount).toBe(1);
    expect([...(await CitySiteRepository.listAllHosts(PROJECT, 100))]).toEqual([
      "austin.example.com",
    ]);

    const blog = (await allRows()).find(
      (row) => row.host === "blog.example.com",
    );
    expect(
      await CitySiteRepository.getByIds(PROJECT, [blog?.id ?? ""]),
    ).toEqual([]);
    expect(
      await CitySiteRepository.findExistingHosts(PROJECT, [
        "blog.example.com",
        "austin.example.com",
      ]),
    ).toEqual(new Set(["austin.example.com"]));
  });

  it("takes a host off City Sites without deleting it from the list", async () => {
    await discover(PROJECT, "austin.example.com");
    await CitySiteRepository.insertMany(PROJECT, [city("austin.example.com")]);
    const [row] = await allRows();

    expect(await CitySiteRepository.removeMany(PROJECT, [row?.id ?? ""])).toBe(
      1,
    );

    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      host: "austin.example.com",
      source: "gsc",
      cityMatchStatus: null,
      locationCode: null,
    });
    expect(
      (
        await CitySiteRepository.listPage({
          projectId: PROJECT,
          limit: 10,
          offset: 0,
        })
      ).totalCount,
    ).toBe(0);
  });

  it("stops adding new hosts at the cap but still upgrades held ones", async () => {
    await discover(PROJECT, "austin.example.com");
    const filler = Array.from(
      { length: MAX_SUBDOMAINS_PER_PROJECT - 2 },
      (_unused, index) => ({
        host: `filler${index}.example.com`,
        source: "manual" as const,
        metrics: {
          organicKeywords: null,
          organicTraffic: null,
          clicks: null,
          impressions: null,
        },
        lastSeenAt: "2026-10-15 00:00:00",
      }),
    );
    await ProjectSubdomainRepository.insertMany(PROJECT, filler);

    // One slot left: austin (held) upgrades, dallas takes the slot, and
    // houston + el-paso do not fit.
    const result = await CitySiteRepository.insertMany(PROJECT, [
      city("austin.example.com"),
      city("dallas.example.com"),
      city("houston.example.com"),
      city("elpaso.example.com"),
    ]);

    expect(result).toEqual({ imported: 2, skippedForCap: 2 });
    expect(await allRows()).toHaveLength(MAX_SUBDOMAINS_PER_PROJECT);
    expect(await CitySiteRepository.countsByStatus(PROJECT)).toMatchObject({
      matched: 2,
    });
  });
});
