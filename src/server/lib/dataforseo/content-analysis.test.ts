import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { fetchBrandMentions } from "@/server/lib/dataforseo/content-analysis";
import { fetchDomainWhois } from "@/server/lib/dataforseo/domain-analytics";
import { fetchAiKeywordVolume } from "@/server/lib/dataforseo/ai-keyword-data";

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
        cost: 0.01,
        result_count: 1,
        result: [result],
      },
    ],
  });
}

describe("DataForSEO content analysis + domain analytics endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("searches brand mentions one-per-domain by default", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(["v3", "content_analysis", "search", "live"], {
        total_count: 1200,
        items: [
          {
            domain: "news.example",
            url: "https://news.example/post",
            domain_rank: 61,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBrandMentions({
      keyword: "flyrocketseo",
      limit: 25,
    });

    expect(result.data.totalCount).toBe(1200);
    expect(result.data.items[0]).toMatchObject({ domain: "news.example" });
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0][1])).toEqual([
      {
        keyword: "flyrocketseo",
        search_mode: "one_per_domain",
        limit: 25,
        order_by: ["content_info.sentence_score,desc"],
        rank_scale: "one_hundred",
      },
    ]);
  });

  it("looks up whois with an exact-domain filter", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(
        ["v3", "domain_analytics", "whois", "overview", "live"],
        {
          items: [
            {
              domain: "example.com",
              created_datetime: "1995-08-14 04:00:00 +00:00",
              registrar: "RESERVED-Internet Assigned Numbers Authority",
              registered: true,
            },
          ],
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDomainWhois({ domain: "example.com" });

    expect(result.data).toMatchObject({
      domain: "example.com",
      registered: true,
    });
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0][1])).toEqual([
      {
        filters: [["domain", "=", "example.com"]],
        limit: 1,
      },
    ]);
  });

  it("returns AI keyword volume items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(
        [
          "v3",
          "ai_optimization",
          "ai_keyword_data",
          "keywords_search_volume",
          "live",
        ],
        {
          items: [{ keyword: "best seo tools", ai_search_volume: 590 }],
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAiKeywordVolume({
      keywords: ["best seo tools"],
      locationCode: 2840,
      languageCode: "en",
    });

    expect(result.data).toEqual([
      { keyword: "best seo tools", ai_search_volume: 590 },
    ]);
  });
});
