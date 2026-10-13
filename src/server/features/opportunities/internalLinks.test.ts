import { applyOpportunityMigrations } from "./opportunityMigrations.fixture";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as schema from "@/db/opportunity-test-schema";
import type { SaveInternalLinkOpportunityInput } from "@/types/schemas/opportunities";
import type { PageInvestigationInput } from "@/types/schemas/page-investigation";
import type { GscPerformanceInput } from "@/server/features/gsc/searchAnalytics";
import type { InternalLinkInput } from "./detectors";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
const state = vi.hoisted(() => ({
  database: null as TestDb | null,
  page: vi.fn(),
  gsc: vi.fn(),
  capture: vi.fn(),
  objects: new Map<string, string>(),
  failR2: false,
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
}));
vi.mock("@/server/features/page-explorer/services/pagePerformance", () => ({
  getPagePerformance: state.page,
}));
vi.mock("./linkSource", () => ({ captureLinkSource: state.capture }));

import { OpportunityRepository } from "./OpportunityRepository";
import { saveInternalLink } from "./internalLinks";

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
const input: SaveInternalLinkOpportunityInput = {
  projectId: context.projectId,
  sourceUrl: "https://example.com/article",
  targetUrl: "https://example.com/service",
  phrase: "coffee service",
  dateRange: "last_28_days",
  searchType: "web",
  startDate: "2026-09-13",
  endDate: "2026-10-10",
};
function captured(links: string[] = []): InternalLinkInput["source"] {
  return {
    url: input.sourceUrl,
    statusCode: 200,
    capturedAt: new Date().toISOString(),
    links,
    locations: [
      { location: "paragraph 1", text: "Our coffee service helps offices." },
    ],
  };
}
function pageReport(request: PageInvestigationInput) {
  return {
    connected: true,
    source: "Google Search Console",
    fetchedAt: new Date().toISOString(),
    scope: {
      ...request,
      siteUrl: "sc-domain:example.com",
      connectedBy: "user-a",
    },
    range: {
      startDate: request.startDate ?? "2026-09-13",
      endDate: request.endDate ?? "2026-10-10",
      prevStartDate: "2026-08-16",
      prevEndDate: "2026-09-12",
    },
    totals: { clicks: 50, impressions: 1000, position: 8, ctr: 0.05 },
    prevTotals: { clicks: 100, impressions: 1200, position: 7, ctr: 0.08 },
    queries: [],
    coverage: {
      currentRows: 28,
      previousRows: 28,
      currentTruncated: false,
      previousTruncated: false,
      queryRows: 1,
      queryTruncated: false,
      finalData: true,
    },
  };
}
const queryRows = () =>
  [input.sourceUrl, input.targetUrl, "https://example.com/service-alt"].map(
    (url) => ({
      keys: [url],
      clicks: 10,
      impressions: 900,
      position: 8,
      ctr: 10 / 900,
    }),
  );
let client: Client;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  state.objects.clear();
  state.failR2 = false;
  state.page
    .mockReset()
    .mockImplementation(async (request: PageInvestigationInput) =>
      pageReport(request),
    );
  state.gsc
    .mockReset()
    .mockImplementation(async (request: GscPerformanceInput) => ({
      siteUrl: "sc-domain:example.com",
      connectedBy: "user-a",
      request,
      rows: queryRows(),
    }));
  state.capture.mockReset().mockImplementation(async () => captured());
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`PRAGMA foreign_keys=ON;
    CREATE TABLE organization(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT PRIMARY KEY, organization_id TEXT, domain TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE member(id TEXT PRIMARY KEY, organization_id TEXT, user_id TEXT);
    INSERT INTO organization VALUES('org-a');
    INSERT INTO projects VALUES('project-a','org-a','example.com');
    INSERT INTO user VALUES('user-a','Alice','alice@example.com');
    INSERT INTO member VALUES('member-a','org-a','user-a');`);
  await applyOpportunityMigrations(client);
  state.database = drizzle(client, { schema });
});
afterEach(() => {
  vi.useRealTimers();
  client.close();
  state.database = null;
});
async function save(request = input) {
  const result = await saveInternalLink(request, context);
  if (result.availability !== "ready")
    throw new Error("Expected a link candidate");
  return result.opportunity;
}

describe("internal-link observation reconciliation on real SQLite", () => {
  it("an existing link clears only the examined pair and retains its capture without changing progress", async () => {
    const first = await save();
    const other = await save({
      ...input,
      targetUrl: "https://example.com/service-alt",
    });
    const started = await OpportunityRepository.update(
      scope,
      first.id,
      first.revision,
      {
        status: "in_progress",
        assigneeUserId: "user-a",
        note: "Reviewing source",
      },
      "user-a",
    );
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    state.capture.mockImplementation(async () => captured([input.targetUrl]));
    expect(await saveInternalLink(input, context)).toMatchObject({
      availability: "no_longer_observed",
    });
    const reconciled = await OpportunityRepository.get(scope, first.id);
    expect(reconciled).toMatchObject({
      observationState: "no_longer_observed",
      status: "in_progress",
      assigneeUserId: "user-a",
      revision: started.revision + 1,
    });
    expect(
      reconciled!.history.some((event) => event.note === "Reviewing source"),
    ).toBe(true);
    expect(await OpportunityRepository.get(scope, other.id)).toMatchObject({
      observationState: "observed",
      revision: other.revision,
    });
    const captureEvent = (
      await client.execute({
        sql: "SELECT s.r2_key FROM opportunity_events e JOIN opportunity_snapshots s ON s.id=e.evidence_snapshot_id WHERE e.opportunity_id=? AND e.kind='no_longer_observed'",
        args: [first.id],
      })
    ).rows[0];
    expect(captureEvent).toBeDefined();
    const captureKey = captureEvent.r2_key;
    if (typeof captureKey !== "string")
      throw new Error("Expected retained capture key");
    const retained = z
      .object({
        raw: z.object({
          source: z.object({ links: z.array(z.string()) }),
        }),
      })
      .parse(JSON.parse(state.objects.get(captureKey) ?? "null"));
    expect(retained.raw.source.links).toEqual([input.targetUrl]);
  });

  it.each([
    "truncated",
    "changed_window",
    "non_final",
    "missing_source",
    "invalid_source",
    "duplicate_source",
  ])(
    "%s query evidence cannot clear a previously observed pair",
    async (fault) => {
      const task = await save();
      vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
      state.capture.mockImplementation(async () => captured([input.targetUrl]));
      state.gsc.mockImplementation(async (request: GscPerformanceInput) => {
        const rows = queryRows();
        if (fault === "missing_source") rows.shift();
        if (fault === "invalid_source") rows[0].impressions = NaN;
        if (fault === "duplicate_source") rows.push(rows[0]);
        return {
          siteUrl: "sc-domain:example.com",
          connectedBy: "user-a",
          request: {
            ...request,
            ...(fault === "truncated" ? { rowLimit: rows.length } : {}),
            ...(fault === "changed_window" ? { startDate: "2026-09-14" } : {}),
            ...(fault === "non_final" ? { dataState: "all" } : {}),
          },
          rows,
        };
      });
      await saveInternalLink(input, context);
      expect(await OpportunityRepository.get(scope, task.id)).toMatchObject({
        observationState: "observed",
        revision: task.revision,
      });
    },
  );

  it("incomplete page evidence does not clear a pair", async () => {
    const task = await save();
    state.capture.mockImplementation(async () => captured([input.targetUrl]));
    state.page.mockImplementation(async (request: PageInvestigationInput) => {
      const report = pageReport(request);
      return {
        ...report,
        coverage: { ...report.coverage, currentTruncated: true },
      };
    });
    await saveInternalLink(input, context);
    expect(await OpportunityRepository.get(scope, task.id)).toMatchObject({
      observationState: "observed",
      revision: task.revision,
    });
  });

  it("failed source capture preserves the pair", async () => {
    const task = await save();
    state.capture.mockRejectedValue(new Error("Source unavailable"));
    await expect(saveInternalLink(input, context)).rejects.toThrow(
      "Source unavailable",
    );
    expect(await OpportunityRepository.get(scope, task.id)).toMatchObject({
      observationState: "observed",
      revision: task.revision,
    });
  });

  it("an unknown captured link graph cannot clear the pair", async () => {
    const task = await save();
    state.capture.mockImplementation(async () => ({
      ...captured(),
      links: undefined,
    }));
    await saveInternalLink(input, context);
    expect(await OpportunityRepository.get(scope, task.id)).toMatchObject({
      observationState: "observed",
      revision: task.revision,
    });
  });

  it("changed device and unequal observation windows cannot clear the old pair", async () => {
    const task = await save();
    state.capture.mockImplementation(async () => captured([input.targetUrl]));
    await saveInternalLink({ ...input, device: "MOBILE" }, context);
    await saveInternalLink({ ...input, startDate: "2026-10-04" }, context);
    expect(await OpportunityRepository.get(scope, task.id)).toMatchObject({
      observationState: "observed",
      revision: task.revision,
    });
  });

  it("a failed evidence retention cannot clear the pair", async () => {
    const task = await save();
    state.capture.mockImplementation(async () => captured([input.targetUrl]));
    state.failR2 = true;
    await expect(saveInternalLink(input, context)).rejects.toThrow(
      "R2 unavailable",
    );
    expect(await OpportunityRepository.get(scope, task.id)).toMatchObject({
      observationState: "observed",
      revision: task.revision,
    });
  });

  it("an older source capture cannot clear a pair observed by a newer capture", async () => {
    const task = await save();
    vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
    state.capture.mockImplementation(async () => captured([input.targetUrl]));
    await saveInternalLink(input, context);
    expect(await OpportunityRepository.get(scope, task.id)).toMatchObject({
      observationState: "observed",
      revision: task.revision,
    });
  });
});
