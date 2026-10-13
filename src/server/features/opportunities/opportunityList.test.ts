import { applyOpportunityMigrations } from "./opportunityMigrations.fixture";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/opportunity-test-schema";
import { evidence } from "./evidence.fixture";
import { detectDecliningPages } from "./detectors";
import { listOpportunitiesInputSchema } from "@/types/schemas/opportunities";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
const state = vi.hoisted(() => ({ database: null as TestDb | null }));
vi.mock("@/db", () => ({
  get db() {
    return state.database;
  },
}));
vi.mock(
  "@/db/schema",
  async () => await import("@/db/opportunity-test-schema"),
);
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: {},
}));

import { OpportunityRepository } from "./OpportunityRepository";
import { list } from "./declineRefresh";

const context = {
  organizationId: "org-a",
  projectId: "project-a",
  userId: "user-a",
  project: { domain: "example.com" },
};
const scope = {
  organizationId: context.organizationId,
  projectId: context.projectId,
  target: "example.com",
};
function taskFixture(
  id: string,
  status: "not_started" | "dismissed" = "not_started",
  taskScope = scope,
) {
  const captured = evidence({
    scope: { ...evidence().scope, ...taskScope },
    url: `https://${taskScope.target}/${id}`,
  });
  const { evidence: _captured, ...generated } = detectDecliningPages([
    captured,
  ])[0];
  return {
    snapshot: {
      id: `snapshot-${id}`,
      ...taskScope,
      schemaVersion: 1,
      contentHash: `hash-${id}`,
      payloadJson: JSON.stringify(captured),
      r2Key: `opportunity-evidence/${taskScope.organizationId}/${taskScope.projectId}/${id}.json`,
      fetchedAt: captured.fetchedAt,
    },
    task: {
      id,
      ...taskScope,
      scopeKey: `scope-${taskScope.projectId}-${taskScope.target}`,
      dedupeKey: `dedupe-${id}`,
      detectorId: "page-decline",
      detectorVersion: "1",
      kind: generated.kind,
      priorityBand: generated.priorityBand,
      generatedJson: JSON.stringify(generated),
      evidenceSnapshotId: `snapshot-${id}`,
      firstSeenAt: captured.fetchedAt,
      lastSeenAt: captured.fetchedAt,
      lastEvaluatedAt: captured.fetchedAt,
      status,
      mutationId: `mutation-${id}`,
    },
  };
}
let client: Client;
beforeEach(async () => {
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`PRAGMA foreign_keys=ON;
    CREATE TABLE organization(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT PRIMARY KEY, organization_id TEXT, domain TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE member(id TEXT PRIMARY KEY, organization_id TEXT, user_id TEXT);
    INSERT INTO organization VALUES('org-a'),('org-b');
    INSERT INTO projects VALUES('project-a','org-a','example.com'),('project-b','org-b','example.com'),('project-c','org-a','example.com');`);
  await applyOpportunityMigrations(client);
  state.database = drizzle(client, { schema });
  const fixtures = [
    ...Array.from({ length: 121 }, (_, index) =>
      taskFixture(
        `task-${String(index).padStart(3, "0")}`,
        index < 110 ? "not_started" : "dismissed",
      ),
    ),
    taskFixture("foreign-org", "not_started", {
      ...scope,
      organizationId: "org-b",
      projectId: "project-b",
    }),
    taskFixture("foreign-project", "not_started", {
      ...scope,
      projectId: "project-c",
    }),
    taskFixture("old-target", "not_started", {
      ...scope,
      target: "replacement.com",
    }),
  ];
  await state.database
    .insert(schema.opportunitySnapshots)
    .values(fixtures.map((row) => row.snapshot));
  await state.database
    .insert(schema.opportunities)
    .values(fixtures.map((row) => row.task));
});
afterEach(() => {
  client.close();
  state.database = null;
});

describe("bounded work pagination on real SQLite", () => {
  it("reaches the older work beyond the first 100 with explicit page coverage", async () => {
    const first = await list(context);
    expect(first.opportunities).toHaveLength(100);
    expect(first.opportunities[0].id).toBe("task-000");
    expect(first.opportunities.at(-1)?.id).toBe("task-099");
    expect(first.coverage).toEqual({
      limit: 100,
      page: 0,
      status: null,
      hasMore: true,
      hasPrevious: false,
    });
    const next = await list(context, { page: 1 });
    expect(next.opportunities).toHaveLength(21);
    expect(next.opportunities[0].id).toBe("task-100");
    expect(next.opportunities.at(-1)?.id).toBe("task-120");
    expect(next.coverage).toEqual({
      limit: 100,
      page: 1,
      status: null,
      hasMore: false,
      hasPrevious: true,
    });
    expect(
      new Set(
        [...first.opportunities, ...next.opportunities].map((task) => task.id),
      ).size,
    ).toBe(121);
  });

  it("filters the whole scoped work set before applying the page limit", async () => {
    const dismissed = await list(context, { status: "dismissed" });
    expect(dismissed.opportunities).toHaveLength(11);
    expect(dismissed.opportunities[0].id).toBe("task-110");
    expect(
      dismissed.opportunities.every((task) => task.status === "dismissed"),
    ).toBe(true);
    expect(dismissed.coverage).toMatchObject({
      page: 0,
      status: "dismissed",
      hasMore: false,
    });
    const activeNext = await list(context, { page: 1, status: "not_started" });
    expect(activeNext.opportunities).toHaveLength(10);
    expect(activeNext.opportunities.at(-1)?.id).toBe("task-109");
    expect(activeNext.coverage.hasMore).toBe(false);
  });

  it("keeps pagination isolated by organization, project and current target", async () => {
    const otherOrg = await list({
      ...context,
      organizationId: "org-b",
      projectId: "project-b",
    });
    expect(otherOrg.opportunities.map((task) => task.id)).toEqual([
      "foreign-org",
    ]);
    const otherProject = await list({ ...context, projectId: "project-c" });
    expect(otherProject.opportunities.map((task) => task.id)).toEqual([
      "foreign-project",
    ]);
    const replacement = await list({
      ...context,
      project: { domain: "replacement.com" },
    });
    expect(replacement.opportunities.map((task) => task.id)).toEqual([
      "old-target",
    ]);
    expect((await list(context, { page: 2 })).opportunities).toHaveLength(0);
  });

  it("retains the per-task history bound while bounding the work pull to 101 rows", async () => {
    await state.database!.insert(schema.opportunityEvents).values(
      Array.from({ length: 60 }, (_, index) => ({
        id: `event-${index}`,
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        opportunityId: "task-000",
        createdAt: "2026-10-13T12:00:00Z",
        kind: "updated" as const,
        status: "not_started" as const,
        revision: index + 1,
        evidenceSnapshotId: "snapshot-task-000",
      })),
    );
    const first = await list(context);
    expect(first.opportunities[0].history).toHaveLength(50);
    expect(first.opportunities[0].historyCoverage.hasMore).toBe(true);
    expect(await OpportunityRepository.list(scope, 500)).toHaveLength(101);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001])(
    "rejects invalid work page %s at the service boundary",
    async (page) => {
      await expect(list(context, { page })).rejects.toThrow();
    },
  );

  it("rejects unsupported status values at both request and service boundaries", async () => {
    expect(
      listOpportunitiesInputSchema.safeParse({
        projectId: context.projectId,
        status: "archived",
      }).success,
    ).toBe(false);
    const request = listOpportunitiesInputSchema.parse({
      projectId: context.projectId,
    });
    Object.defineProperty(request, "status", {
      value: "archived",
      enumerable: true,
    });
    await expect(list(context, request)).rejects.toThrow();
  });
});
