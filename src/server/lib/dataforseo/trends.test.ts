import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchClickstreamSearchVolume,
  fetchGoogleTrendsExplore,
} from "@/server/lib/dataforseo/trends";

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
        cost: 0.005,
        result_count: 1,
        result: [result],
      },
    ],
  });
}

describe("DataForSEO trends endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a numeric location_code and parses trend graph items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(
        ["v3", "keywords_data", "google_trends", "explore", "live"],
        {
          items: [
            {
              type: "google_trends_graph",
              keywords: ["seo tools", "rank tracker"],
              averages: [55, 12],
              data: [
                {
                  date_from: "2026-01-04",
                  date_to: "2026-01-10",
                  timestamp: 1767484800,
                  values: [60, 10],
                },
              ],
            },
          ],
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGoogleTrendsExplore({
      keywords: ["seo tools", "rank tracker"],
      locationCode: 2840,
      languageCode: "en",
    });

    expect(result.data[0].type).toBe("google_trends_graph");
    expect(result.data[0].averages).toEqual([55, 12]);
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0][1])).toEqual([
      {
        keywords: ["seo tools", "rank tracker"],
        location_code: 2840,
        language_code: "en",
        item_types: ["google_trends_graph"],
      },
    ]);
  });

  it("requests clickstream-refined volume and parses keyword items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockTaskResponse(
        [
          "v3",
          "keywords_data",
          "clickstream_data",
          "dataforseo_search_volume",
          "live",
        ],
        {
          items: [{ keyword: "seo tools", search_volume: 8100 }],
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchClickstreamSearchVolume({
      keywords: ["seo tools"],
      locationCode: 2840,
      languageCode: "en",
    });

    expect(result.data).toEqual([
      { keyword: "seo tools", search_volume: 8100 },
    ]);
    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0][1])).toEqual([
      {
        keywords: ["seo tools"],
        location_code: 2840,
        language_code: "en",
        use_clickstream: true,
      },
    ]);
  });
});
