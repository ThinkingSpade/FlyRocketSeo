import { z } from "zod";
import { evidenceSnapshotSchema } from "@/types/schemas/opportunities";
import { applyOpportunityMigrations } from "./opportunityMigrations.fixture";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/opportunity-test-schema";
import { evidence } from "./evidence.fixture";

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
import { OpportunityService } from "./OpportunityService";

let client: Client;
const scope: EvidenceScope = evidence().scope;
const row = (clicks: number) => ({
  keys: ["https://example.com/article"],
  clicks,
  impressions: 1200,
  position: 8,
  ctr: clicks / 1200,
});
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

describe("opportunity capture orchestration with fixture providers", () => {
  const context = {
    organizationId: "org-a",
    projectId: "project-a",
    userId: "user-a",
    project: { domain: "example.com" },
  };
  it("a provider-clamped previous window cannot manufacture an equal-window decline", async () => {
    state.gsc.mockImplementation(
      async (input: { startDate: string; endDate: string }) => ({
        siteUrl: "sc-domain:example.com",
        connectedBy: "user-a",
        request: {
          ...input,
          rowLimit: 1000,
          startDate:
            input.startDate === "2026-08-16" ? "2026-08-17" : input.startDate,
        },
        rows: [row(input.startDate === "2026-09-13" ? 50 : 100)],
      }),
    );
    const result = await OpportunityService.refresh(
      {
        projectId: "project-a",
        dateRange: "last_28_days",
        searchType: "web",
        startDate: "2026-09-13",
        endDate: "2026-10-10",
      },
      context,
    );
    expect(result.availability).toBe("insufficient");
    expect(result.opportunities).toEqual([]);
  });
  it("a sampled rerun preserves both progress and prior observation state", async () => {
    const request = {
      projectId: "project-a",
      dateRange: "last_28_days" as const,
      searchType: "web" as const,
      startDate: "2026-09-13",
      endDate: "2026-10-10",
    };
    state.gsc.mockImplementation(async (input: { startDate: string }) => ({
      siteUrl: "sc-domain:example.com",
      connectedBy: "user-a",
      request: { ...input, rowLimit: 1000 },
      rows: [row(input.startDate === "2026-09-13" ? 50 : 100)],
    }));
    const initial = await OpportunityService.refresh(request, context);
    const task = initial.opportunities[0];
    await OpportunityRepository.update(
      scope,
      task.id,
      task.revision,
      { status: "in_progress", note: "Investigating" },
      "user-a",
    );
    state.gsc.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      connectedBy: "user-a",
      request: { rowLimit: 1000 },
      rows: Array.from({ length: 1000 }, () => row(50)),
    });
    const result = await OpportunityService.refresh(request, context);
    expect(result.availability).toBe("insufficient");
    expect(result.opportunities[0]).toMatchObject({
      status: "in_progress",
      observationState: "observed",
    });
  });
  it("invalid future reporting windows cannot create successful looking page declines", async () => {
    state.gsc.mockImplementation(async (input: { startDate: string }) => ({
      siteUrl: "sc-domain:example.com",
      connectedBy: "user-a",
      request: { ...input, rowLimit: 1000 },
      rows: [
        {
          keys: ["https://example.com/article"],
          clicks: input.startDate > "2026-12-01" ? 50 : 100,
          impressions: 1200,
          position: 8,
          ctr: 0.05,
        },
      ],
    }));
    const result = await OpportunityService.refresh(
      {
        projectId: "project-a",
        dateRange: "last_28_days",
        searchType: "web",
        startDate: "2026-12-04",
        endDate: "2026-12-31",
      },
      context,
    );
    expect(result.availability).toBe("insufficient");
    expect(result.reasons.join(" ")).toMatch(/reporting lag/);
    expect(result.opportunities).toEqual([]);
  });
  it("captures final matching page pulls and persists a reproducible decline", async () => {
    state.gsc.mockImplementation(
      async (input: {
        startDate: string;
        rowLimit: number;
        dataState: string;
        type: string;
        dimensions: string[];
      }) => {
        expect(input.dataState).toBe("final");
        expect(input.type).toBe("web");
        expect(input.dimensions).toEqual(["page"]);
        return {
          siteUrl: "sc-domain:example.com",
          connectedBy: "user-a",
          request: { ...input, rowLimit: 1000 },
          rows: [
            {
              keys: ["https://example.com/article"],
              clicks: input.startDate === "2026-09-13" ? 50 : 100,
              impressions: 1200,
              position: 8,
              ctr: 0.05,
            },
          ],
        };
      },
    );
    const result = await OpportunityService.refresh(
      {
        projectId: "project-a",
        dateRange: "last_28_days",
        searchType: "web",
        startDate: "2026-09-13",
        endDate: "2026-10-10",
      },
      context,
    );
    expect(result.availability).toBe("ready");
    expect(result.opportunities).toHaveLength(1);
    expect(state.objects.size).toBe(1);
    const stored = z
      .object({ evidence: evidenceSnapshotSchema })
      .parse(JSON.parse([...state.objects.values()][0]));
    expect(stored.evidence.scope).toMatchObject({
      organizationId: "org-a",
      projectId: "project-a",
      target: "example.com",
      siteUrl: "sc-domain:example.com",
    });
  });
  it("a property changed mid-pull fails before creating task or evidence", async () => {
    state.gsc.mockImplementation(async (input: { startDate: string }) => ({
      siteUrl:
        input.startDate === "2026-09-13"
          ? "sc-domain:example.com"
          : "sc-domain:other.com",
      connectedBy: "user-a",
      request: { ...input, rowLimit: 1000 },
      rows: [],
    }));
    await expect(
      OpportunityService.refresh(
        {
          projectId: "project-a",
          dateRange: "last_28_days",
          searchType: "web",
          startDate: "2026-09-13",
          endDate: "2026-10-10",
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await OpportunityRepository.list(scope)).toEqual([]);
    expect(state.objects.size).toBe(0);
  });
  it("a coherent property on another website cannot reconcile this project's tasks", async () => {
    state.gsc.mockResolvedValue({
      siteUrl: "sc-domain:other.com",
      connectedBy: "user-a",
      request: { rowLimit: 1000 },
      rows: [],
    });
    await expect(
      OpportunityService.refresh(
        {
          projectId: "project-a",
          dateRange: "last_28_days",
          searchType: "web",
          startDate: "2026-09-13",
          endDate: "2026-10-10",
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await OpportunityRepository.latestRun(scope)).toBeNull();
  });
  it("refuses to create a saved page action without available GSC evidence", async () => {
    state.page.mockResolvedValue({ connected: false, reason: "not_connected" });
    await expect(
      OpportunityService.savePage(
        {
          projectId: "project-a",
          url: "https://example.com/article",
          dateRange: "last_28_days",
          searchType: "web",
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await OpportunityRepository.list(scope)).toEqual([]);
  });
  it("R2 write failure is visible and creates no unbacked task", async () => {
    state.failR2 = true;
    state.gsc.mockImplementation(async (input: { startDate: string }) => ({
      siteUrl: "sc-domain:example.com",
      connectedBy: "user-a",
      request: { ...input, rowLimit: 1000 },
      rows: [
        {
          keys: ["https://example.com/article"],
          clicks: input.startDate === "2026-09-13" ? 50 : 100,
          impressions: 1200,
          position: 8,
          ctr: 0.05,
        },
      ],
    }));
    await expect(
      OpportunityService.refresh(
        {
          projectId: "project-a",
          dateRange: "last_28_days",
          searchType: "web",
          startDate: "2026-09-13",
          endDate: "2026-10-10",
        },
        context,
      ),
    ).rejects.toThrow("R2 unavailable");
    expect(await OpportunityRepository.list(scope)).toEqual([]);
  });
});
