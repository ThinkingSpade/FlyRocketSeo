import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchBulkKeywordDifficulty,
  fetchCompetitorsDomain,
  fetchDomainIntersection,
} from "@/server/lib/dataforseo/labs-competitors";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

function mockTaskResponse(path: string[], result: unknown) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        path,
        cost: 0.0101,
        result_count: 1,
        result: [result],
      },
    ],
  });
}

describe("DataForSEO Labs competitor endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes both intersection targets despite the SDK's target_1/target1 mismatch", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockTaskResponse(
          ["v3", "dataforseo_labs", "google", "domain_intersection", "live"],
          { items: [], total_count: 0 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchDomainIntersection({
      target1: "competitor.com",
      target2: "example.com",
      intersections: false,
      locationCode: 2840,
      languageCode: "en",
      limit: 100,
    });

    const [url, init] = fetchMock.mock.calls[0];
    const requestUrl =
      typeof url === "string" || url instanceof URL ? url.toString() : url.url;
    expect(requestUrl).toBe(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_intersection/live",
    );
    expect(parseDataforseoRequestBody(init)).toEqual([
      {
        target1: "competitor.com",
        target2: "example.com",
        intersections: false,
        location_code: 2840,
        language_code: "en",
        include_serp_info: false,
        include_clickstream_data: false,
        limit: 100,
      },
    ]);
  });

  it("returns competitor items, total count, and billing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(
        ["v3", "dataforseo_labs", "google", "competitors_domain", "live"],
        {
          total_count: 250,
          items: [
            {
              domain: "rival.com",
              avg_position: 12.5,
              intersections: 420,
            },
          ],
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCompetitorsDomain({
      target: "example.com",
      locationCode: 2840,
      languageCode: "en",
      limit: 25,
      excludeTopDomains: true,
    });

    expect(result.data.totalCount).toBe(250);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]).toMatchObject({ domain: "rival.com" });
    expect(result.billing).toEqual({
      path: ["v3", "dataforseo_labs", "google", "competitors_domain", "live"],
      costUsd: 0.0101,
    });

    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0][1])).toEqual([
      {
        target: "example.com",
        location_code: 2840,
        language_code: "en",
        exclude_top_domains: true,
        limit: 25,
      },
    ]);
  });

  it("returns bulk keyword difficulty items and billing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(
        ["v3", "dataforseo_labs", "google", "bulk_keyword_difficulty", "live"],
        {
          items: [
            { keyword: "seo tools", keyword_difficulty: 74 },
            { keyword: "keyword gap", keyword_difficulty: 41 },
          ],
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBulkKeywordDifficulty({
      keywords: ["seo tools", "keyword gap"],
      locationCode: 2840,
      languageCode: "en",
    });

    expect(result.data).toEqual([
      { keyword: "seo tools", keyword_difficulty: 74 },
      { keyword: "keyword gap", keyword_difficulty: 41 },
    ]);
    expect(result.billing.costUsd).toBe(0.0101);
  });
});
