import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DomainService } from "@/server/features/domain/services/DomainService";
import { createBacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { buildBacklinksTabExport } from "@/client/features/backlinks/export";
import { buildCsv } from "@/client/lib/csv";
import { backlinksOverviewCacheSchema } from "@/types/schemas/backlinks-results";

const mocks = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  record: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "isolated-fixture-key",
}));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: mocks.record },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => mocks.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    mocks.cache.set(key, value);
  },
}));

// Only billing's client wrapper is replaced. Actual SDK serialization, HTTP
// envelope/task parsing and endpoint adapters run against in-memory responses.
vi.mock("@/server/lib/dataforseo", async () => {
  const labs = await import("./labs");
  const backlinks = await import("./backlinks");
  const { normalizeBacklinksTarget } =
    await import("@/server/lib/dataforseoBacklinksTarget");
  return {
    normalizeBacklinksTarget,
    createDataforseoClient: () => ({
      domain: {
        rankOverview: async (
          input: Parameters<typeof labs.fetchDomainRankOverview>[0],
        ) => (await labs.fetchDomainRankOverview(input)).data,
      },
      backlinks: {
        summary: async (
          input: Parameters<typeof backlinks.fetchBacklinksSummary>[0],
        ) => (await backlinks.fetchBacklinksSummary(input)).data,
        history: async (
          input: Parameters<typeof backlinks.fetchBacklinksHistory>[0],
        ) => (await backlinks.fetchBacklinksHistory(input)).data,
        domainPages: async (
          input: Parameters<typeof backlinks.fetchDomainPagesSummary>[0],
        ) => (await backlinks.fetchDomainPagesSummary(input)).data,
      },
    }),
  };
});

const customer = {
  organizationId: "fixture-org",
  userId: "fixture-user",
  userEmail: "test@example.com",
};
const service = createBacklinksService({
  get: async (key) => mocks.cache.get(key) ?? null,
  set: async (key, value) => {
    mocks.cache.set(key, value);
  },
});
const requests: Array<{ url: string; payload: unknown }> = [];

function captureRequest(url: RequestInfo | URL, init?: RequestInit) {
  const requestUrl =
    typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  if (typeof init?.body !== "string")
    throw new Error("Expected SDK JSON request body");
  requests.push({ url: requestUrl, payload: JSON.parse(init.body) });
  return requestUrl.split("/").slice(3);
}

function response(path: string[], result: unknown[]) {
  return new Response(
    JSON.stringify({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          status_code: 20000,
          status_message: "Ok.",
          path,
          cost: 0.01,
          result_count: result.length,
          result,
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  mocks.cache.clear();
  requests.length = 0;
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it("runs Labs SDK envelopes through DomainService and reuses scoped zero/partial observations", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    captureRequest(url, init);
    return response(
      ["v3", "dataforseo_labs", "google", "domain_rank_overview", "live"],
      [
        {
          target: "example.com",
          location_code: 2840,
          language_code: "en",
          items: [
            {
              location_code: 2840,
              language_code: "en",
              metrics: { organic: { count: 0, etv: 0, pos_1: 2, pos_4_10: 0 } },
            },
          ],
        },
      ],
    );
  });
  const input = {
    projectId: "fixture-project",
    domain: "example.com",
    includeSubdomains: true,
    locationCode: 2840,
    languageCode: "en",
  };
  const result = await DomainService.getOverview(input, customer);
  expect(result).toMatchObject({
    organicKeywords: 0,
    organicTraffic: 0,
    hasData: true,
    positionBuckets: { top3: null, pos4to10: 0 },
  });
  expect(await DomainService.getOverview(input, customer)).toEqual(result);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.payload).toMatchObject([
    { target: "example.com", location_code: 2840, language_code: "en" },
  ]);
});

it("rejects a Labs envelope reporting a different market before associating it with the requested scope", async () => {
  vi.mocked(fetch).mockResolvedValue(
    response(
      ["v3", "dataforseo_labs", "google", "domain_rank_overview", "live"],
      [
        {
          target: "example.com",
          location_code: 2826,
          language_code: "en",
          items: [
            {
              location_code: 2826,
              language_code: "en",
              metrics: { organic: { count: 20 } },
            },
          ],
        },
      ],
    ),
  );
  await expect(
    DomainService.getOverview(
      {
        projectId: "fixture-project",
        domain: "example.com",
        includeSubdomains: true,
        locationCode: 2840,
        languageCode: "en",
      },
      customer,
    ),
  ).rejects.toMatchObject({
    code: "INTERNAL_ERROR",
    billing: { costUsd: 0.01 },
  });
  expect(mocks.cache.size).toBe(0);
});

it("runs Backlinks SDK summary/history through saved-schema restoration without inventing events", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const path = captureRequest(url, init);
    return path.includes("summary")
      ? response(path, [
          {
            target: "example.com",
            backlinks: 0,
            referring_domains: 1.5,
            rank: 101,
          },
        ])
      : response(path, [
          {
            items: [
              { date: "2026-02-30", backlinks: 7 },
              { date: "2026-02-01", backlinks: 0, new_referring_domains: 2 },
              { date: "2021-04-01", new_backlinks: 0, lost_backlinks: 0 },
            ],
          },
        ]);
  });
  const first = await service.profileOverview(
    { target: "example.com", scope: "domain" },
    customer,
  );
  const restored = backlinksOverviewCacheSchema.parse(
    JSON.parse(JSON.stringify({ overview: first.overview })),
  );
  expect(restored.overview.summary).toMatchObject({
    backlinks: 0,
    referringDomains: null,
    rank: null,
  });
  expect(restored.overview.trends.map((point) => point.date)).toEqual([
    "2021-04-01",
    "2026-02-01",
  ]);
  expect(restored.overview.newLostTrends[0]?.newBacklinks).toBeNull();
  expect(restored.overview.newLostTrends[1]?.lostReferringDomains).toBeNull();
  expect(
    await service.profileOverview(
      { target: "example.com", scope: "domain" },
      customer,
    ),
  ).toEqual(first);
  expect(requests).toHaveLength(2);
  expect(requests[0]?.payload).toMatchObject([
    { target: "example.com", rank_scale: "one_hundred" },
  ]);
});

it("runs a real list envelope into nullable table values and blank CSV cells", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    captureRequest(url, init);
    return response(
      ["v3", "backlinks", "domain_pages_summary", "live"],
      [
        {
          total_count: 1,
          items: [
            {
              page: "https://example.com/page",
              backlinks: -1,
              referring_domains: 0,
              rank: 101,
              broken_backlinks: 1.5,
            },
          ],
        },
      ],
    );
  });
  const result = await service.profileTopPagesPage(
    {
      target: "example.com",
      scope: "domain",
      page: 1,
      pageSize: 100,
      sortField: "backlinks",
      sortOrder: "desc",
      filters: {},
    },
    customer,
  );
  const table = buildBacklinksTabExport({
    tab: "pages",
    rows: {
      backlinks: [],
      referringDomains: [],
      topPages: result.rows,
      anchors: [],
    },
  });
  expect(result.totalCount).toBe(1);
  expect(result.hasMore).toBe(false);
  expect(buildCsv(table.headers, table.rows).split("\n")[1]).toBe(
    [
      '"https://example.com/page","","0","",""',
      ...Array<string>(9).fill('"unknown"'),
    ].join(","),
  );
  expect(requests).toHaveLength(1);
});

it("rejects declared Backlinks target mismatch and retains billed-task metadata", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const path = captureRequest(url, init);
    return response(path, [{ target: "other.com", items: [], backlinks: 3 }]);
  });
  await expect(
    service.profileOverview({ target: "example.com", scope: "page" }, customer),
  ).rejects.toMatchObject({
    code: "INTERNAL_ERROR",
    billing: { costUsd: 0.01 },
  });
  expect(mocks.cache.size).toBe(0);
});

it.each(["summary", "pages"] as const)(
  "retains charged-task metadata when a successful %s task has malformed observations",
  async (kind) => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = captureRequest(url, init);
      return response(
        path,
        kind === "summary"
          ? [{ backlinks: "unexpected-value" }]
          : [
              {
                total_count: 1,
                items: [
                  {
                    page: "https://example.com/page",
                    backlinks: "unexpected-value",
                  },
                ],
              },
            ],
      );
    });
    try {
      const result =
        kind === "summary"
          ? service.profileOverview(
              { target: "example.com", scope: "page" },
              customer,
            )
          : service.profileTopPagesPage(
              {
                target: "example.com",
                scope: "domain",
                page: 1,
                pageSize: 100,
                sortField: "backlinks",
                sortOrder: "desc",
                filters: {},
              },
              customer,
            );
      await expect(result).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        billing: { costUsd: 0.01 },
      });
      expect(logged).toHaveBeenCalled();
      expect(mocks.cache.size).toBe(0);
    } finally {
      logged.mockRestore();
    }
  },
);
