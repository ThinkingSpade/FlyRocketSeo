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

describe("bounded opportunity history on real SQLite", () => {
  it("excludes implementation on the baseline's final Pacific calendar day", async () => {
    const task = await save();
    await expect(
      OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        {
          status: "implemented",
          implementedAt: "2026-10-11T06:59:59Z",
          note: "Changed title",
        },
        "user-a",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await OpportunityRepository.get(scope, task.id))!.status).toBe(
      "not_started",
    );
    expect(
      await OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        {
          status: "implemented",
          implementedAt: "2026-10-11T07:00:00Z",
          note: "Changed title",
        },
        "user-a",
      ),
    ).toMatchObject({ status: "implemented" });
  });

  it("keeps recent history bounded and pages through older retained events", async () => {
    const task = await save();
    await state.database!.insert(schema.opportunityEvents).values(
      Array.from({ length: 120 }, (_, index) => ({
        id: `event-${index}`,
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        opportunityId: task.id,
        actorUserId: "user-a",
        createdAt: "2026-10-13T12:00:00Z",
        kind: "updated" as const,
        status: "in_progress" as const,
        revision: index + 2,
        note: `Note ${index}`,
        evidenceSnapshotId: "hash-a",
      })),
    );
    const reloaded = (await OpportunityRepository.get(scope, task.id))!;
    expect(reloaded.history).toHaveLength(50);
    expect(reloaded.historyCoverage).toEqual({
      hasMore: true,
      beforeRevision: 72,
    });
    expect(reloaded.history.map((event) => event.revision)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 72),
    );
    const listed = (await OpportunityRepository.list(scope))[0];
    expect(listed.history).toEqual(reloaded.history);
    expect(listed.historyCoverage).toEqual(reloaded.historyCoverage);
    const older = await OpportunityRepository.history(scope, task.id, 72);
    expect(older.events).toHaveLength(50);
    expect(older.beforeRevision).toBe(22);
    expect(older.hasMore).toBe(true);
    const first = await OpportunityRepository.history(scope, task.id, 22);
    expect(first.events).toHaveLength(21);
    expect(first.hasMore).toBe(false);
    expect(first.events[0].kind).toBe("created");
    await expect(
      OpportunityRepository.history(
        { ...scope, target: "replacement.com" },
        task.id,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      OpportunityRepository.history(
        { ...scope, organizationId: "org-b" },
        task.id,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
