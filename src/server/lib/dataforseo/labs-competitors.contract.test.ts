import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "fixture-key"),
}));
import {
  fetchBulkKeywordDifficulty,
  fetchBulkTrafficEstimation,
  fetchCompetitorsDomain,
  fetchDomainIntersection,
  fetchHistoricalRankOverview,
  fetchKeywordsForSite,
  fetchSearchIntent,
  fetchSerpCompetitors,
  fetchSubdomains,
} from "./labs-competitors";
const scope = { locationCode: 2840, languageCode: "en" };
function response(result: unknown[]) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        path: ["v3", "dataforseo_labs", "fixture", "live"],
        cost: 0.012,
        result_count: result.length,
        result,
      },
    ],
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("Remaining Labs SDK contracts", () => {
  it("normalizes consumed SDK observations while keeping estimates precise and zeros reported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            items: [
              {
                domain: "rival.com",
                avg_position: 0,
                intersections: 1.5,
                full_domain_metrics: {
                  organic: { count: 0, etv: 0.1234, pos_1: -1 },
                },
              },
            ],
            total_count: 1,
          },
        ]),
      ),
    );
    expect(
      (
        await fetchCompetitorsDomain({
          ...scope,
          target: "example.com",
          limit: 25,
        })
      ).data.items[0],
    ).toMatchObject({
      avg_position: null,
      intersections: null,
      full_domain_metrics: { organic: { count: 0, etv: 0.1234, pos_1: null } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            items: [
              {
                keyword: "seo",
                keyword_intent: { label: "commercial", probability: 2 },
              },
            ],
          },
        ]),
      ),
    );
    expect(
      (await fetchSearchIntent({ languageCode: "en", keywords: ["seo"] }))
        .data[0],
    ).toMatchObject({ keyword_intent: { probability: null } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            items: [
              {
                keyword_data: {
                  keyword: "seo",
                  keyword_info: {
                    search_volume: 0,
                    cpc: 0.1234,
                    competition: -1,
                  },
                  keyword_properties: { keyword_difficulty: 101 },
                },
                first_domain_serp_element: { rank_absolute: 0 },
                second_domain_serp_element: { rank_absolute: 1.5 },
              },
            ],
          },
        ]),
      ),
    );
    expect(
      (
        await fetchDomainIntersection({
          ...scope,
          target1: "example.com",
          target2: "rival.com",
          intersections: true,
          limit: 25,
        })
      ).data.items[0],
    ).toMatchObject({
      keyword_data: {
        keyword_info: { search_volume: 0, cpc: 0.1234, competition: null },
        keyword_properties: { keyword_difficulty: null },
      },
      first_domain_serp_element: { rank_absolute: null },
      second_domain_serp_element: { rank_absolute: null },
    });
  });
  it("rejects malformed SDK items and preserves charged task errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response([{ items: [null] }])),
    );
    await expect(
      fetchKeywordsForSite({ ...scope, target: "example.com", limit: 25 }),
    ).rejects.toMatchObject({ billing: { costUsd: 0.012 } });
  });
  const reads = [
    [
      "domain competitors",
      () =>
        fetchCompetitorsDomain({ ...scope, target: "example.com", limit: 25 }),
    ],
    [
      "SERP competitors",
      () =>
        fetchSerpCompetitors({
          ...scope,
          keywords: ["seo"],
          limit: 25,
          itemTypes: ["organic"],
        }),
    ],
    [
      "intersection",
      () =>
        fetchDomainIntersection({
          ...scope,
          target1: "example.com",
          target2: "rival.com",
          intersections: true,
          limit: 25,
        }),
    ],
    [
      "site keywords",
      () =>
        fetchKeywordsForSite({ ...scope, target: "example.com", limit: 25 }),
    ],
    [
      "bulk difficulty",
      () => fetchBulkKeywordDifficulty({ ...scope, keywords: ["seo"] }),
    ],
    [
      "intent",
      () => fetchSearchIntent({ languageCode: "en", keywords: ["seo"] }),
    ],
    [
      "bulk traffic",
      () => fetchBulkTrafficEstimation({ ...scope, targets: ["example.com"] }),
    ],
    [
      "history",
      () => fetchHistoricalRankOverview({ ...scope, target: "example.com" }),
    ],
    [
      "subdomains",
      () => fetchSubdomains({ ...scope, target: "example.com", limit: 25 }),
    ],
  ] as const;
  it.each(reads)(
    "rejects missing successful %s result while retaining billed metadata",
    async (_, read) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([])));
      await expect(read()).rejects.toMatchObject({
        billing: { costUsd: 0.012 },
      });
    },
  );
  it.each(reads)("rejects %s mismatched language evidence", async (_, read) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            language_code: "fr",
            location_code: 2840,
            items: [],
            total_count: 0,
          },
        ]),
      ),
    );
    await expect(read()).rejects.toMatchObject({ billing: { costUsd: 0.012 } });
  });
  it("preserves genuinely empty pages and safe total count without synthesizing invalid totals", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response([{ ...scope, items: [], total_count: 0 }])),
    );
    expect(
      (
        await fetchCompetitorsDomain({
          ...scope,
          target: "example.com",
          limit: 25,
        })
      ).data,
    ).toEqual({ items: [], totalCount: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response([{ items: [], total_count: 1.5 }])),
    );
    expect(
      (await fetchSubdomains({ ...scope, target: "example.com", limit: 25 }))
        .data.totalCount,
    ).toBeNull();
  });
  it("checks both intersection targets and exact bulk keyword/target sets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            target1: "foreign.com",
            target2: "rival.com",
            items: [],
            total_count: 0,
          },
        ]),
      ),
    );
    await expect(
      fetchDomainIntersection({
        ...scope,
        target1: "example.com",
        target2: "rival.com",
        intersections: true,
        limit: 25,
      }),
    ).rejects.toMatchObject({ billing: { costUsd: 0.012 } });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([
            { items: [{ keyword: "foreign", keyword_difficulty: 0 }] },
          ]),
        ),
    );
    await expect(
      fetchBulkKeywordDifficulty({ ...scope, keywords: ["seo"] }),
    ).rejects.toMatchObject({ billing: { costUsd: 0.012 } });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([{ items: [{ target: "foreign.com", etv: 0 }] }]),
        ),
    );
    await expect(
      fetchBulkTrafficEstimation({ ...scope, targets: ["example.com"] }),
    ).rejects.toMatchObject({ billing: { costUsd: 0.012 } });
  });
});
