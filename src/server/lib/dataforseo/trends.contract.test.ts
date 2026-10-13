import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "isolated-key",
}));
import {
  fetchClickstreamSearchVolume,
  fetchGlobalSearchVolume,
  fetchGoogleTrendsExplore,
} from "./trends";

const keywords = ["seo tools"];
const input = { keywords, locationCode: 2840, languageCode: "en" };
const graph = {
  type: "google_trends_graph",
  keywords,
  averages: [0],
  data: [
    {
      date_from: "2026-01-04",
      date_to: "2026-01-10",
      timestamp: 1767484800,
      values: [0],
    },
  ],
};
function reply(result: unknown, data: unknown = undefined, extra = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: ["v3", "keywords_data", "fixture", "live"],
            cost: 0.005,
            result_count: 1,
            result: [result],
            data,
            ...extra,
          },
        ],
      }),
    ),
  );
}
afterEach(() => vi.unstubAllGlobals());
describe("Trends and Clickstream raw SDK contracts", () => {
  for (const [name, fetcher, item] of [
    ["trends", () => fetchGoogleTrendsExplore(input), graph],
    [
      "clickstream",
      () => fetchClickstreamSearchVolume(input),
      { keyword: "seo tools", search_volume: 0 },
    ],
    [
      "global",
      () => fetchGlobalSearchVolume({ keywords }),
      { keyword: "seo tools", search_volume: 0 },
    ],
  ] as const) {
    it.each([
      undefined,
      {},
      { items: "invalid" },
      { items: null, items_count: 1 },
    ])(
      `${name} rejects malformed billed success instead of a free-looking empty observation (%j)`,
      async (result) => {
        reply(result);
        await expect(fetcher()).rejects.toMatchObject({
          name: "DataforseoChargedTaskError",
          billing: { costUsd: 0.005 },
        });
      },
    );
    it(`${name} preserves explicit successful empties`, async () => {
      reply({ items: [] });
      expect((await fetcher()).data).toEqual([]);
      reply({ items: null, items_count: 0 });
      expect((await fetcher()).data).toEqual([]);
      reply(null, undefined, {
        status_code: 40501,
        status_message: "No Search Results.",
        result_count: 0,
      });
      expect((await fetcher()).data).toEqual([]);
    });
    it(`${name} rejects another declared requested keyword list`, async () => {
      reply({ items: [item] }, { keywords: ["foreign"] });
      await expect(fetcher()).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
      });
    });
  }
  it.each([
    { location_code: 2826 },
    { language_code: "de" },
    { use_clickstream: false },
  ])("rejects mismatched clickstream market/source %j", async (scope) => {
    reply({ ...scope, items: [{ keyword: "seo tools", search_volume: 1 }] });
    await expect(fetchClickstreamSearchVolume(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
  });
  it("accepts documented corrected spelling without relabeling volume", async () => {
    reply(
      {
        location_code: 2840,
        language_code: "en",
        items: [
          {
            keyword: "youtube",
            search_volume: null,
            monthly_searches: [{ year: 2026, month: 1, search_volume: 0 }],
          },
        ],
      },
      { keywords: ["youtub"] },
    );
    expect(
      (await fetchClickstreamSearchVolume({ ...input, keywords: ["youtub"] }))
        .data[0],
    ).toMatchObject({
      keyword: "youtube",
      search_volume: null,
      monthly_searches: [{ year: 2026, month: 1, search_volume: 0 }],
    });
  });
  it.each([
    { ...graph, keywords: ["foreign"] },
    { ...graph, data: undefined },
    { ...graph, averages: [101] },
    { ...graph, data: [{ ...graph.data[0], values: [-1] }] },
    { ...graph, data: [{ ...graph.data[0], values: [4, 5] }] },
    { ...graph, data: [{ ...graph.data[0], date_from: "2026-02-30" }] },
    { ...graph, data: [{ ...graph.data[0], timestamp: 1767571200 }] },
  ])(
    "rejects mismatched graph columns or impossible evidence %j",
    async (item) => {
      reply({ items: [item] });
      await expect(fetchGoogleTrendsExplore(input)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
      });
    },
  );
  it("accepts worldwide location zero and keeps documented zero and nullable interest", async () => {
    reply({
      location_code: 0,
      items: [
        {
          ...graph,
          averages: [],
          data: [{ ...graph.data[0], values: [null], missing_data: true }],
        },
      ],
    });
    expect(
      (await fetchGoogleTrendsExplore({ keywords, languageCode: "en" })).data[0]
        .data?.[0],
    ).toMatchObject({ values: [null], missing_data: true });
  });
  it("rejects an echoed date window different from the authorized request", async () => {
    reply({ items: [graph] }, { date_from: "2025-01-01" });
    await expect(
      fetchGoogleTrendsExplore({
        ...input,
        dateFrom: "2026-01-01",
        dateTo: "2026-02-01",
      }),
    ).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { costUsd: 0.005 },
    });
  });
  it.each([
    { keyword: "seo tools", search_volume: -1 },
    { keyword: "seo tools", search_volume: 1.5 },
    {
      keyword: "seo tools",
      monthly_searches: [{ year: 2026, month: 13, search_volume: 1 }],
    },
  ])("rejects invalid clickstream counts/months %j", async (item) => {
    reply({ items: [item] });
    await expect(fetchClickstreamSearchVolume(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
  });
  it("rejects invalid global country/count evidence", async () => {
    reply({
      items: [
        {
          keyword: "seo tools",
          search_volume: null,
          country_distribution: [
            { country_iso_code: "USA", search_volume: -5 },
          ],
        },
      ],
    });
    await expect(fetchGlobalSearchVolume({ keywords })).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
  });
  it("rejects an unrelated global keyword while accepting the provider's documented decoding", async () => {
    reply({ items: [{ keyword: "foreign", search_volume: 50 }] });
    await expect(fetchGlobalSearchVolume({ keywords })).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
    reply({ items: [{ keyword: "seo tools", search_volume: 0 }] });
    expect(
      (await fetchGlobalSearchVolume({ keywords: ["seo%20tools"] })).data[0]
        .keyword,
    ).toBe("seo tools");
  });
  it("rejects duplicate graphs instead of discarding an ambiguous observation", async () => {
    reply({ items: [graph, graph] });
    await expect(fetchGoogleTrendsExplore(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
  });
  it.each([
    { type: "news" },
    { category_code: 5 },
    { item_types: ["google_trends_map"] },
  ])("rejects a declared different Trends source/filter %j", async (data) => {
    reply({ items: [graph] }, data);
    await expect(fetchGoogleTrendsExplore(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
  });
});
