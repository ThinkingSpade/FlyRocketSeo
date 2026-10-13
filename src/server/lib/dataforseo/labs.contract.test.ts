import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "fixture-key"),
}));
import {
  fetchKeywordIdeas,
  fetchKeywordOverview,
  fetchKeywordSuggestions,
  fetchRelatedKeywords,
  fetchRankedKeywords,
  fetchRelevantPages,
} from "./labs";
import { fetchAdsSearchVolume, fetchAdsKeywordIdeas } from "./google-ads";
import { DataforseoChargedTaskError } from "./envelope";

const input = {
  keyword: "seo",
  locationCode: 2840,
  languageCode: "en",
  limit: 150,
};
function response(result: unknown[], status = 20000, message = "Ok.") {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: status,
        status_message: message,
        path: ["v3", "fixture", "live"],
        cost: 0.012,
        result_count: result.length,
        result,
      },
    ],
  });
}
afterEach(() => vi.unstubAllGlobals());

describe("Labs and Ads actual SDK response contracts", () => {
  const reads = [
    ["suggestions", () => fetchKeywordSuggestions(input)],
    ["ideas", () => fetchKeywordIdeas(input)],
    ["related", () => fetchRelatedKeywords(input)],
    ["overview", () => fetchKeywordOverview({ ...input, keywords: ["seo"] })],
    ["ranked", () => fetchRankedKeywords({ ...input, target: "example.com" })],
    ["pages", () => fetchRelevantPages({ ...input, target: "example.com" })],
  ] as const;
  it.each(reads)(
    "rejects %s successful tasks without result evidence and retains billing",
    async (_, read) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([])));
      await expect(read()).rejects.toMatchObject({
        billing: { costUsd: 0.012 },
      });
    },
  );
  it.each(reads)("rejects %s mismatched market", async (_, read) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            location_code: 2826,
            language_code: "en",
            items: [],
            total_count: 0,
          },
        ]),
      ),
    );
    await expect(read()).rejects.toBeInstanceOf(DataforseoChargedTaskError);
  });
  it.each(reads)(
    "accepts %s reported empty results and genuine zero total",
    async (_, read) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          response([
            {
              location_code: 2840,
              language_code: "en",
              items: [],
              total_count: 0,
            },
          ]),
        ),
      );
      const result = await read();
      expect(result.billing.costUsd).toBe(0.012);
      expect(
        Array.isArray(result.data) ? result.data : result.data.items,
      ).toEqual([]);
    },
  );
  it("rejects ranked rows for another target, unsafe totals, and malformed items", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([{ target: "foreign.com", items: [], total_count: 0 }]),
        ),
    );
    await expect(
      fetchRankedKeywords({ ...input, target: "example.com" }),
    ).rejects.toBeInstanceOf(DataforseoChargedTaskError);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([{ items: [{ keyword: "seo" }], total_count: -1 }]),
        ),
    );
    expect(
      (await fetchRankedKeywords({ ...input, target: "example.com" })).data
        .totalCount,
    ).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response([{ items: "bad" }])),
    );
    await expect(fetchKeywordIdeas(input)).rejects.toBeInstanceOf(
      DataforseoChargedTaskError,
    );
  });
  it("retains billed failure and treats only explicit no search results as empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response([], 40501, "No Search Results.")),
    );
    expect((await fetchKeywordIdeas(input)).data).toEqual([]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response([], 40501, "Invalid Field: 'keyword'.")),
    );
    await expect(fetchKeywordIdeas(input)).rejects.toMatchObject({
      billing: { costUsd: 0.012 },
    });
  });
  it("validates Ads flat results and exact metric keywords", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([
            { keyword: "foreign", location_code: 2840, language_code: "en" },
          ]),
        ),
    );
    await expect(
      fetchAdsSearchVolume({ ...input, keywords: ["seo"] }),
    ).rejects.toBeInstanceOf(DataforseoChargedTaskError);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response([{ keyword: "seo", location_code: 2826 }])),
    );
    await expect(fetchAdsKeywordIdeas(input)).rejects.toBeInstanceOf(
      DataforseoChargedTaskError,
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response([{ keyword: "seo", search_volume: 0 }])),
    );
    expect(
      (await fetchAdsSearchVolume({ ...input, keywords: ["seo"] })).data[0]
        .search_volume,
    ).toBe(0);
  });
});
