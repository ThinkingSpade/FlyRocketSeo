import { applyOpportunityMigrations } from "./opportunityMigrations.fixture";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/opportunity-test-schema";
import { evidence } from "./evidence.fixture";
import { detectDecliningPages } from "./detectors";
import type { EvidenceScope } from "@/shared/opportunities";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
const state = vi.hoisted(() => ({
  database: null as TestDb | null,
  gsc: vi.fn(),
  page: vi.fn(),
  objects: new Map<string, string>(),
  failR2: false,
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    R2: {
      put: async (key: string, value: string) => {
        if (state.failR2) throw new Error("R2 unavailable");
        if (!state.objects.has(key)) state.objects.set(key, value);
        return {};
      },
    },
  },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getAnalyticsPerformance: state.gsc },
  toGscUnavailable: (error: unknown) => {
    throw error;
  },
}));
vi.mock("@/server/features/page-explorer/services/pagePerformance", () => ({
  getPagePerformance: state.page,
}));
vi.mock("@/db", () => ({
  get db() {
    return state.database;
  },
}));
vi.mock(
  "@/db/schema",
  async () => await import("@/db/opportunity-test-schema"),
);
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: (tx: TestDb) => Parameters<TestDb["batch"]>[0]) => {
    const statements = build(state.database!);
    if (statements.length) await state.database!.batch(statements);
  },
}));
import { OpportunityRepository } from "./OpportunityRepository";

let client: Client;
const scope: EvidenceScope = evidence().scope;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  state.objects.clear();
  state.failR2 = false;
  state.gsc.mockReset();
  state.page.mockReset();
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`PRAGMA foreign_keys=ON;
    CREATE TABLE organization(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT PRIMARY KEY, organization_id TEXT, domain TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE member(id TEXT PRIMARY KEY, organization_id TEXT, user_id TEXT);
    INSERT INTO organization VALUES('org-a'),('org-b');
    INSERT INTO projects VALUES('project-a','org-a','example.com'),('project-b','org-b','elsewhere.com');
    INSERT INTO user VALUES('user-a','Alice','alice@example.com'),('user-b','Bob','bob@example.com');
    INSERT INTO member VALUES('member-a','org-a','user-a'),('member-b','org-b','user-b');`);
  await applyOpportunityMigrations(client);
  state.database = drizzle(client, { schema });
});

afterEach(() => {
  vi.useRealTimers();
  client.close();
  state.database = null;
});

async function save(version = "1") {
  const snapshot = evidence();
  await OpportunityRepository.putSnapshot(
    snapshot,
    "hash-a",
    "opportunity-evidence/org-a/project-a/hash-a",
  );
  return OpportunityRepository.upsertFinding({
    scope,
    scopeKey: "scope-a",
    dedupeKey: "stable-a",
    detectorId: "page-decline",
    detectorVersion: version,
    finding: detectDecliningPages([snapshot])[0],
    snapshotId: "hash-a",
    actorUserId: "user-a",
  });
}

describe("opportunity lifecycle on real SQLite", () => {
  it("persists a task and scopes every lookup to organization, project and target", async () => {
    const task = await save();
    expect(task.status).toBe("not_started");
    expect(await OpportunityRepository.list(scope)).toHaveLength(1);
    expect(
      await OpportunityRepository.get(
        { ...scope, organizationId: "org-b" },
        task.id,
      ),
    ).toBeNull();
    expect(
      await OpportunityRepository.get(
        { ...scope, projectId: "project-b" },
        task.id,
      ),
    ).toBeNull();
    expect(
      await OpportunityRepository.list({ ...scope, target: "replacement.com" }),
    ).toEqual([]);
  });
  it("reruns and detector upgrades keep assignment, implementation and baseline", async () => {
    const task = await save();
    const updated = await OpportunityRepository.update(
      scope,
      task.id,
      task.revision,
      {
        status: "implemented",
        assigneeUserId: "user-a",
        implementedAt: "2026-10-11T12:00:00Z",
        note: "Title reviewed",
      },
      "user-a",
    );
    const rerun = await save("2");
    expect(rerun.id).toBe(task.id);
    expect(rerun).toMatchObject({
      status: "implemented",
      assigneeUserId: "user-a",
      implementedAt: "2026-10-11T12:00:00Z",
    });
    expect(
      await OpportunityRepository.getBaseline(scope, task.id),
    ).toMatchObject({
      url: "https://example.com/article",
      current: { clicks: 50 },
    });
    expect(
      updated.history.some((event) => event.note === "Title reviewed"),
    ).toBe(true);
    expect(await OpportunityRepository.list(scope)).toHaveLength(1);
  });
  it("rejects a stale edit without adding a history entry", async () => {
    const task = await save();
    await OpportunityRepository.update(
      scope,
      task.id,
      task.revision,
      { status: "in_progress", note: "Started" },
      "user-a",
    );
    await expect(
      OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        { status: "dismissed", note: "Stale" },
        "user-a",
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const current = await OpportunityRepository.get(scope, task.id);
    expect(current!.status).toBe("in_progress");
    expect(current!.history.some((event) => event.note === "Stale")).toBe(
      false,
    );
  });
  it("refuses manual measured state, invalid implementation dates and foreign assignees", async () => {
    const task = await save();
    await expect(
      OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        { status: "measured" },
        "user-a",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        { status: "implemented", implementedAt: "2026-09-01T12:00:00Z" },
        "user-a",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        { assigneeUserId: "user-b" },
        "user-a",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await OpportunityRepository.listAssignees("org-a")).toEqual([
      { userId: "user-a", name: "Alice", email: "alice@example.com" },
    ]);
  });
  it("disappearing evidence is separate from fixed and incomplete runs do not clear tasks", async () => {
    const task = await save();
    await OpportunityRepository.reconcileObserved(scope, {
      scopeKey: "scope-a",
      detectorId: "page-decline",
      observedDedupeKeys: [],
      complete: false,
      fetchedAt: "2026-10-14T12:00:00Z",
    });
    expect(
      (await OpportunityRepository.get(scope, task.id))!.observationState,
    ).toBe("observed");
    await OpportunityRepository.reconcileObserved(scope, {
      scopeKey: "scope-a",
      detectorId: "page-decline",
      observedDedupeKeys: [],
      complete: true,
      fetchedAt: "2026-10-14T12:00:00Z",
    });
    expect(await OpportunityRepository.get(scope, task.id)).toMatchObject({
      observationState: "no_longer_observed",
      status: "not_started",
    });
  });
  it("immutable snapshot conflicts cannot replace retained evidence", async () => {
    await save();
    await OpportunityRepository.putSnapshot(
      evidence({ current: { clicks: 999, impressions: 1000, position: 1 } }),
      "hash-a",
      "other-key",
    );
    const task = (await OpportunityRepository.list(scope))[0];
    expect(task.evidence.current.clicks).toBe(50);
  });
  it("requires implementation notes and refuses to change the locked implementation date", async () => {
    const task = await save();
    await expect(
      OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        { status: "implemented", implementedAt: "2026-10-11T12:00:00Z" },
        "user-a",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const implemented = await OpportunityRepository.update(
      scope,
      task.id,
      task.revision,
      {
        status: "implemented",
        implementedAt: "2026-10-11T12:00:00Z",
        note: "Reviewed title",
      },
      "user-a",
    );
    await expect(
      OpportunityRepository.update(
        scope,
        task.id,
        implemented.revision,
        {
          status: "implemented",
          implementedAt: "2026-10-12T12:00:00Z",
          note: "Changed date",
        },
        "user-a",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("an older capture cannot reopen an opportunity evaluated by a newer complete run", async () => {
    const task = await save();
    await OpportunityRepository.reconcileObserved(scope, {
      scopeKey: "scope-a",
      detectorId: "page-decline",
      observedDedupeKeys: [],
      complete: true,
      fetchedAt: "2026-10-15T12:00:00Z",
    });
    const older = evidence({ fetchedAt: "2026-10-14T12:00:00Z" });
    await OpportunityRepository.putSnapshot(older, "hash-older", "older-key");
    await OpportunityRepository.upsertFinding({
      scope,
      scopeKey: "scope-a",
      dedupeKey: "stable-a",
      detectorId: "page-decline",
      detectorVersion: "1",
      finding: detectDecliningPages([older])[0],
      snapshotId: "hash-older",
      actorUserId: "user-a",
    });
    expect(
      (await OpportunityRepository.get(scope, task.id))!.observationState,
    ).toBe("no_longer_observed");
  });
  it("prioritizes an older high exposure task before a newer low exposure task", async () => {
    await save();
    const newer = evidence({
      fetchedAt: "2026-10-14T12:00:00Z",
      url: "https://example.com/newer",
    });
    await OpportunityRepository.putSnapshot(newer, "hash-newer", "newer-key");
    const finding = {
      ...detectDecliningPages([newer])[0],
      priorityBand: "low" as const,
    };
    await OpportunityRepository.upsertFinding({
      scope,
      scopeKey: "scope-a",
      dedupeKey: "newer-task",
      detectorId: "page-decline",
      detectorVersion: "1",
      finding,
      snapshotId: "hash-newer",
      actorUserId: "user-a",
    });
    expect((await OpportunityRepository.list(scope))[0].url).toBe(
      "https://example.com/article",
    );
  });
  it("only sufficient comparable measurement advances to measured, missing outcomes remain pending", async () => {
    const task = await save();
    const implemented = await OpportunityRepository.update(
      scope,
      task.id,
      task.revision,
      {
        status: "implemented",
        implementedAt: "2026-10-11T12:00:00Z",
        note: "Reviewed title",
      },
      "user-a",
    );
    const after = evidence({
      window: { startDate: "2026-10-18", endDate: "2026-11-14" },
      current: { clicks: 70, impressions: 1300, position: 6 },
    });
    await OpportunityRepository.putSnapshot(after, "hash-after", "after-key");
    const measured = await OpportunityRepository.storeMeasurement(
      scope,
      task.id,
      implemented.revision,
      "hash-after",
      "user-a",
    );
    expect(measured).toMatchObject({
      status: "measured",
      result: { availability: "measured", clicksChange: 20 },
    });
    await OpportunityRepository.putSnapshot(
      {
        ...after,
        current: { clicks: 0, impressions: 0, position: null },
        coverage: { ...after.coverage, currentRows: 0 },
      },
      "hash-pending",
      "pending-key",
    );
    const pending = await OpportunityRepository.storeMeasurement(
      scope,
      task.id,
      measured.revision,
      "hash-pending",
      "user-a",
    );
    expect(pending).toMatchObject({
      status: "results_pending",
      result: { availability: "insufficient", clicksChange: null },
    });
    const reloaded = await OpportunityRepository.get(scope, task.id);
    const comparisons = reloaded!.history.filter(
      (event) => event.kind === "measurement",
    );
    expect(comparisons.map((event) => event.result?.availability)).toEqual([
      "measured",
      "insufficient",
    ]);
    expect(comparisons[0].result?.clicksChange).toBe(20);
  });
});
