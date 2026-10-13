import { beforeEach, describe, expect, it, vi } from "vitest";
const doubles = vi.hoisted(() => ({
  record: vi.fn(),
  buildCacheKey: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  rankedKeywords: vi.fn(),
  summary: vi.fn(),
}));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: doubles.record },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: doubles.buildCacheKey,
  getCached: doubles.getCached,
  setCached: doubles.setCached,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    domain: { rankedKeywords: doubles.rankedKeywords },
    backlinks: { summary: doubles.summary },
  }),
}));
import { PageExplorerService } from "./PageExplorerService";
import { pageExplorerSchema } from "@/types/schemas/page-explorer";
const customer = {
  organizationId: "org-a",
  userId: "user-a",
  userEmail: "a@example.com",
};
const input = {
  projectId: "project-a",
  url: "https://example.com/guide?edition=one",
  locationCode: 2840,
};
function raw(traffic: number | null = 0.4) {
  return {
    keyword_data: {
      keyword: "coffee",
      keyword_info: { search_volume: 100, cpc: 0.25 },
    },
    ranked_serp_element: {
      serp_item: {
        rank_absolute: 4,
        etv: traffic,
        url: input.url,
        relative_url: "/guide",
      },
    },
  };
}
beforeEach(() => {
  for (const double of Object.values(doubles)) double.mockReset();
  doubles.buildCacheKey.mockImplementation((prefix: string, scope: unknown) =>
    Promise.resolve(`${prefix}:${JSON.stringify(scope)}`),
  );
  doubles.getCached.mockResolvedValue(null);
  doubles.setCached.mockResolvedValue(undefined);
  doubles.record.mockResolvedValue(undefined);
  doubles.rankedKeywords.mockResolvedValue({ items: [raw()], totalCount: 1 });
  doubles.summary.mockResolvedValue({
    rank: 0,
    backlinks: 0,
    referring_domains: 0,
  });
});
describe("Page Explorer captured evidence", () => {
  it("retains partial traffic and unknown provider totals instead of synthesizing zero", async () => {
    doubles.rankedKeywords.mockResolvedValue({
      items: [raw(null)],
      totalCount: null,
    });
    const result = await PageExplorerService.getPageExplorer(input, customer);
    expect(result.estimatedTraffic).toBeNull();
    expect(result.totalKeywords).toBeNull();
    expect(result.keywords[0]?.traffic).toBeNull();
    expect(result.backlinks?.backlinks).toBe(0);
  });
  it("preserves estimate precision and a genuine zero sample", async () => {
    expect(
      (await PageExplorerService.getPageExplorer(input, customer))
        .estimatedTraffic,
    ).toBe(0.4);
    doubles.rankedKeywords.mockResolvedValue({
      items: [raw(0)],
      totalCount: 1,
    });
    expect(
      (await PageExplorerService.getPageExplorer(input, customer))
        .estimatedTraffic,
    ).toBe(0);
  });
  it("does not share exact-URL backlinks between query variants", async () => {
    await PageExplorerService.getPageExplorer(input, customer);
    await PageExplorerService.getPageExplorer(
      { ...input, url: "https://example.com/guide?edition=two" },
      customer,
    );
    expect(await doubles.buildCacheKey.mock.results[0]?.value).not.toEqual(
      await doubles.buildCacheKey.mock.results[1]?.value,
    );
    expect(doubles.buildCacheKey.mock.calls[0]?.[1]).toMatchObject({
      url: input.url,
    });
  });
  it("reuses an empty scoped capture with its original date", async () => {
    doubles.rankedKeywords.mockResolvedValue({ items: [], totalCount: 0 });
    const first = await PageExplorerService.getPageExplorer(input, customer);
    expect(first).toMatchObject({
      contractVersion: 2,
      source: "DataForSEO Labs and Backlinks",
      scope: {
        organizationId: "org-a",
        projectId: "project-a",
        url: input.url,
        locationCode: 2840,
        languageCode: "en",
      },
      estimatedTraffic: 0,
      totalKeywords: 0,
    });
    doubles.getCached.mockResolvedValue(first);
    expect(await PageExplorerService.getPageExplorer(input, customer)).toEqual(
      first,
    );
    expect(doubles.rankedKeywords).toHaveBeenCalledTimes(1);
  });
  it("rejects a foreign capture rather than assigning current request scope", async () => {
    const first = await PageExplorerService.getPageExplorer(input, customer);
    doubles.getCached.mockResolvedValue({
      ...first,
      scope: { organizationId: "org-other" },
    });
    expect(
      (await PageExplorerService.getPageExplorer(input, customer)).url,
    ).toBe(input.url);
    expect(doubles.rankedKeywords).toHaveBeenCalledTimes(2);
  });
  it("rejects a cached full URL that disagrees with its captured scope", async () => {
    const first = await PageExplorerService.getPageExplorer(input, customer);
    doubles.getCached.mockResolvedValue({
      ...first,
      url: "https://foreign.example/guide",
    });
    const second = await PageExplorerService.getPageExplorer(input, customer);
    expect(second.url).toBe(input.url);
    expect(doubles.rankedKeywords).toHaveBeenCalledTimes(2);
  });
  it("waits for the actual cache object before saving a durable analysis reference", async () => {
    let release: (() => void) | undefined;
    doubles.setCached.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = PageExplorerService.getPageExplorer(input, customer);
    await vi.waitFor(() => expect(doubles.setCached).toHaveBeenCalledOnce());
    expect(doubles.record).not.toHaveBeenCalled();
    release?.();
    await pending;
    expect(doubles.record).toHaveBeenCalledOnce();
  });
  it("keeps the paid result and skips stale saved-run copying after a failed put", async () => {
    doubles.setCached.mockRejectedValue(new Error("isolated failed put"));
    const result = await PageExplorerService.getPageExplorer(input, customer);
    expect(result.keywords[0]?.keyword).toBe("coffee");
    expect(doubles.record).not.toHaveBeenCalled();
    expect(doubles.rankedKeywords).toHaveBeenCalledOnce();
  });
  it("retains useful legacy rows and capture while suppressing its uncertified traffic aggregate", () => {
    const legacy = pageExplorerSchema.parse({
      url: input.url,
      domain: "example.com",
      path: "/guide",
      locationCode: 2840,
      languageCode: "en",
      keywords: [
        {
          keyword: "coffee",
          position: 4,
          searchVolume: 0,
          traffic: null,
          cpc: 0.25,
          url: input.url,
          relativeUrl: "/guide",
          keywordDifficulty: null,
        },
      ],
      totalKeywords: null,
      estimatedTraffic: 0,
      backlinks: null,
      fetchedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(legacy.estimatedTraffic).toBeNull();
    expect(legacy.keywords[0]?.searchVolume).toBe(0);
    expect(legacy.fetchedAt).toBe("2026-09-01T00:00:00.000Z");
  });
});
