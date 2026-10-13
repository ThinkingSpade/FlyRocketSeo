import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return state.database;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/opportunity-test-schema"));
vi.mock("@/db/provider", () => ({ getDatabaseProvider: () => "d1" }));
import * as schema from "@/db/opportunity-test-schema";
import {
  getConfigTrend,
  getEarliestSnapshotsForKeywords,
  getKeywordHistory,
  getLatestSnapshotsForKeywords,
  getPositionMatrix,
  getSnapshotsBeforeDate,
} from "./snapshotQueries";
import { rankScopeJson } from "../rankObservationScope";
let sqlite: Client;
const scope = rankScopeJson({
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  serpDepth: 20,
});
async function seedRun(
  id: string,
  checkedAt: string,
  scopeJson: string | null,
  position: number | null,
  status = "completed",
) {
  await sqlite.execute({
    sql: "INSERT INTO rank_check_runs(id,config_id,project_id,status,started_at,scope_json) VALUES(?,?,?,?,?,?)",
    args: [id, "config-1", "project-1", status, checkedAt, scopeJson],
  });
  await sqlite.execute({
    sql: "INSERT INTO rank_snapshots(run_id,tracking_keyword_id,keyword,device,position,checked_at) VALUES(?,?,?,?,?,?)",
    args: [id, "kw-1", "alpha", "desktop", position, checkedAt],
  });
}
describe("real SQLite rank scope queries", () => {
  beforeEach(async () => {
    sqlite = createClient({ url: ":memory:" });
    for (const filename of readdirSync("drizzle")
      .filter((name) => name.endsWith(".sql"))
      .toSorted())
      await sqlite.executeMultiple(
        readFileSync(join("drizzle", filename), "utf8"),
      );
    state.database = drizzle(sqlite, { schema });
    await sqlite.execute({
      sql: "INSERT INTO organization(id,name,slug,created_at) VALUES(?,?,?,?)",
      args: ["org-1", "Isolated", "isolated", 1],
    });
    await sqlite.execute({
      sql: "INSERT INTO projects(id,name,domain,organization_id) VALUES(?,?,?,?)",
      args: ["project-1", "Isolated", "example.com", "org-1"],
    });
    await sqlite.execute({
      sql: "INSERT INTO rank_tracking_configs(id,project_id,domain,location_code,language_code,devices,serp_depth) VALUES(?,?,?,?,?,?,?)",
      args: ["config-1", "project-1", "example.com", 2840, "en", "both", 20],
    });
    await seedRun("valid", "2026-10-01 00:00:00", scope, 8);
    await seedRun("legacy", "2026-10-02 00:00:00", null, 1);
    await seedRun(
      "other-scope",
      "2026-10-03 00:00:00",
      rankScopeJson({
        domain: "other.example",
        locationCode: 2840,
        languageCode: "en",
        serpDepth: 20,
      }),
      2,
    );
    await seedRun("failed", "2026-10-04 00:00:00", scope, 3, "failed");
  });
  afterEach(() => sqlite.close());
  it("filters scope before selecting the latest/earliest snapshot", async () => {
    expect(await getLatestSnapshotsForKeywords("config-1")).toMatchObject([
      { runId: "valid", position: 8, scopeJson: scope },
    ]);
    expect(
      await getSnapshotsBeforeDate("config-1", "2026-10-05 00:00:00"),
    ).toMatchObject([{ runId: "valid", position: 8 }]);
    expect(
      await getEarliestSnapshotsForKeywords("config-1", ["kw-1"]),
    ).toMatchObject([{ runId: "valid", position: 8 }]);
  });
  it("keeps history, matrix and distributions in the original current evidence scope", async () => {
    expect(await getKeywordHistory("config-1", "kw-1", 730)).toHaveLength(1);
    expect(await getPositionMatrix("config-1", "desktop", 12)).toMatchObject([
      { runId: "valid", position: 8 },
    ]);
    expect(await getConfigTrend("config-1", "desktop", 730)).toMatchObject([
      { runId: "valid", total: 1, top4to10: 1 },
    ]);
  });
  it("excludes old evidence after configuration changes while retaining stored history", async () => {
    await sqlite.execute({
      sql: "UPDATE rank_tracking_configs SET serp_depth=40 WHERE id=?",
      args: ["config-1"],
    });
    expect(await getLatestSnapshotsForKeywords("config-1")).toEqual([]);
    expect(await getPositionMatrix("config-1", "desktop", 12)).toEqual([]);
    expect(
      (await sqlite.execute("SELECT count(*) AS count FROM rank_snapshots"))
        .rows[0],
    ).toEqual({ count: 4 });
  });
});
