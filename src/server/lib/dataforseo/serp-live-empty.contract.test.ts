import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "live-empty-fixture-key",
}));

import { fetchLiveSerp, fetchRankCheckTaskResult } from "./serp";

const input = {
  keyword: "Rocket business Dallas",
  locationCode: 2840,
  languageCode: "en",
};
const scope = {
  keyword: input.keyword,
  location_code: input.locationCode,
  language_code: input.languageCode,
  device: "desktop",
};
const path = ["v3", "serp", "google", "organic", "live", "advanced"];
const organic = {
  type: "organic",
  rank_absolute: 1,
  domain: "directory.example",
  url: "https://directory.example/rocket",
};
const documentedEmpty = {
  status_code: 40102,
  result_count: 1,
  data: { ...scope, location_code: "2840" },
  result: [{ ...scope, se_results_count: 0, items_count: 0, items: null }],
};

function fixture(overrides: Record<string, unknown> = {}) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        id: "empty-search-task",
        status_code: 40501,
        status_message: "No Search Results.",
        cost: 0.002,
        path,
        data: scope,
        result: [],
        ...overrides,
      },
    ],
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("live SERP explicit no-results HTTP contract", () => {
  it("accepts the documented 40102 null-items metadata without losing its charge", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fixture(documentedEmpty)));
    await expect(fetchLiveSerp(input)).resolves.toEqual({
      data: [],
      billing: { path, costUsd: 0.002 },
    });
  });

  it("accepts a canonical numeric location echo on an observed SERP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fixture({
          status_code: 20000,
          status_message: "Ok.",
          data: { ...scope, location_code: "2840" },
          result: [{ ...scope, items: [organic] }],
        }),
      ),
    );
    await expect(fetchLiveSerp(input)).resolves.toMatchObject({
      data: [organic],
      billing: { path, costUsd: 0.002 },
    });
  });

  it("accepts canonical integer location and depth echoes on a queued observation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fixture({
          id: "empty-search-task",
          status_code: 20000,
          status_message: "Ok.",
          data: { ...scope, location_code: "2840", depth: "100" },
          result: [{ ...scope, depth: "100", items: [organic] }],
        }),
      ),
    );
    await expect(
      fetchRankCheckTaskResult({
        ...input,
        keywordId: "rocket-keyword",
        taskId: "empty-search-task",
        targetDomain: "directory.example",
        device: "desktop",
        depth: 100,
      }),
    ).resolves.toMatchObject({
      status: "completed",
      result: { position: 1, url: "https://directory.example/rocket" },
    });
  });

  it.each([
    "02840",
    " 2840",
    "+2840",
    "2840.0",
    "2.84e3",
    "9007199254740993",
    "2826",
  ])(
    "rejects the invalid or foreign numeric location echo %s",
    async (locationCode) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            fixture({ data: { ...scope, location_code: locationCode } }),
          ),
      );
      await expect(fetchLiveSerp(input)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        message: "DataForSEO SERP returned mismatched location_code",
        billing: { path, costUsd: 0.002 },
      });
    },
  );

  it.each(["0100", " 100", "+100", "100.0", "1e2", "9007199254740993", "20"])(
    "rejects the invalid or foreign numeric depth echo %s",
    async (depth) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(fixture({ data: { ...scope, depth } })),
      );
      await expect(
        fetchRankCheckTaskResult({
          ...input,
          keywordId: "rocket-keyword",
          taskId: "empty-search-task",
          targetDomain: "directory.example",
          device: "desktop",
          depth: 100,
        }),
      ).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        message: "DataForSEO SERP returned mismatched depth",
        billing: { path, costUsd: 0.002 },
      });
    },
  );

  it.each([
    ["keyword", "Different business Dallas"],
    ["location_code", 2826],
    ["language_code", "fr"],
    ["device", "mobile"],
  ])(
    "rejects a documented empty result with conflicting metadata %s",
    async (key, value) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          fixture({
            ...documentedEmpty,
            result: [
              {
                ...scope,
                [key]: value,
                se_results_count: 0,
                items_count: 0,
                items: null,
              },
            ],
          }),
        ),
      );
      await expect(fetchLiveSerp(input)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        message: `DataForSEO SERP returned mismatched ${key}`,
        billing: { path, costUsd: 0.002 },
      });
    },
  );

  it("retains the charge and requested scope for a 40501 empty observation", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(fixture());
    vi.stubGlobal("fetch", transport);
    await expect(fetchLiveSerp(input)).resolves.toEqual({
      data: [],
      billing: { path, costUsd: 0.002 },
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[0]).toBe(
      "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    );
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    const requestBody = transport.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== "string") {
      throw new Error("Expected the SDK's JSON request body");
    }
    expect(JSON.parse(requestBody) as unknown).toMatchObject([
      { ...scope, depth: 100, os: "windows" },
    ]);
  });

  it.each([
    ["keyword", "Different business Dallas"],
    ["location_code", 2826],
    ["language_code", "fr"],
    ["device", "mobile"],
  ])(
    "rejects an empty sentinel with a conflicting declared %s",
    async (key, value) => {
      const transport = vi
        .fn()
        .mockResolvedValue(fixture({ data: { ...scope, [key]: value } }));
      vi.stubGlobal("fetch", transport);
      await expect(fetchLiveSerp(input)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        message: `DataForSEO SERP returned mismatched ${key}`,
        billing: { path, costUsd: 0.002 },
      });
      expect(transport).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["missing result", { result: undefined }],
    ["null result", { result: null }],
    ["malformed result", { result: "malformed" }],
    ["nonempty result without items", { result: [{ ...scope }] }],
    ["null items without zero counts", { result: [{ ...scope, items: null }] }],
    [
      "null items with positive count",
      {
        result: [
          { ...scope, se_results_count: 0, items_count: 1, items: null },
        ],
      },
    ],
    [
      "null items with positive search count",
      {
        result: [
          { ...scope, se_results_count: 1, items_count: 0, items: null },
        ],
      },
    ],
    [
      "nonempty malformed items",
      { result: [{ ...scope, items: "malformed" }] },
    ],
    [
      "nonempty malformed rows",
      { result: [{ ...scope, items: ["malformed"] }] },
    ],
    [
      "nonempty invalid ranks",
      { result: [{ ...scope, items: [{ ...organic, rank_absolute: 0 }] }] },
    ],
  ])(
    "does not reinterpret %s as a known empty observation",
    async (_name, overrides) => {
      const transport = vi.fn().mockResolvedValue(fixture(overrides));
      vi.stubGlobal("fetch", transport);
      await expect(fetchLiveSerp(input)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        billing: { path, costUsd: 0.002 },
      });
      expect(transport).toHaveBeenCalledOnce();
    },
  );

  it("rejects a foreign scope in a nonempty billed no-results payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fixture({
          result: [{ ...scope, location_code: 2826, items: [organic] }],
        }),
      ),
    );
    await expect(fetchLiveSerp(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      message: "DataForSEO SERP returned mismatched location_code",
      billing: { path, costUsd: 0.002 },
    });
  });

  it("keeps a charged 40501 validation failure distinct from no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fixture({
          status_message: "Invalid Field: 'keyword'.",
        }),
      ),
    );
    await expect(fetchLiveSerp(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      isInvalidField: true,
      billing: { path, costUsd: 0.002 },
    });
  });

  it("still rejects missing successful observation items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fixture({
          status_code: 20000,
          status_message: "Ok.",
          result: [{ ...scope }],
        }),
      ),
    );
    await expect(fetchLiveSerp(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { path, costUsd: 0.002 },
    });
  });

  it("preserves a valid nonempty successful observation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fixture({
          status_code: 20000,
          status_message: "Ok.",
          result: [{ ...scope, items: [organic] }],
        }),
      ),
    );
    await expect(fetchLiveSerp(input)).resolves.toMatchObject({
      data: [organic],
      billing: { path, costUsd: 0.002 },
    });
  });
});
