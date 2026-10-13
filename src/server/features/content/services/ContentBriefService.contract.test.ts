import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentBriefSchema } from "@/types/schemas/content";

const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  write: vi.fn(),
  record: vi.fn(),
  overview: vi.fn(),
  related: vi.fn(),
  instant: vi.fn(),
}));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: state.record },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: unknown) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => state.cache.get(key),
  setCached: state.write,
}));
vi.mock("@/server/features/serp/services/SerpOverviewService", () => ({
  SerpOverviewService: { getSerpOverview: state.overview },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    keywords: { related: state.related },
    onPage: { instantPage: state.instant },
  }),
}));
import { ContentBriefService } from "./ContentBriefService";

const input = { projectId: "p1", keyword: "coffee", locationCode: 2840 };
const billing = {
  organizationId: "org1",
  userId: "u1",
  userEmail: "u@test.invalid",
};
const originalCapture = "2026-10-01T12:00:00.000Z";
beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.write.mockImplementation(async (key: string, value: unknown) => {
    state.cache.set(key, value);
  });
  state.overview.mockResolvedValue({
    results: [],
    paaQuestions: [],
    fetchedAt: originalCapture,
  });
  state.related.mockResolvedValue([]);
  state.instant.mockResolvedValue({
    url: "https://example.com/",
    meta: { content: { plain_text_word_count: 0 } },
  });
});
describe("Content brief scoped evidence and durable reuse", () => {
  it("does not certify stored versioned rows whose body disagrees with captured scope", async () => {
    const captured = await ContentBriefService.getContentBrief(input, billing);
    expect(
      contentBriefSchema.safeParse({ ...captured, keyword: "foreign keyword" })
        .success,
    ).toBe(false);
    expect(
      contentBriefSchema.safeParse({ ...captured, locationCode: 2826 }).success,
    ).toBe(false);
    expect(
      contentBriefSchema.safeParse({ ...captured, components: undefined })
        .success,
    ).toBe(false);
  });
  it("does not certify a foreign-scope payload stored under this cache key", async () => {
    await ContentBriefService.getContentBrief(input, billing);
    for (const [key, value] of state.cache) {
      const cached = contentBriefSchema.parse(value);
      state.cache.set(key, {
        ...cached,
        scope: { ...cached.scope, projectId: "foreign" },
      });
    }
    expect(
      await ContentBriefService.getContentBrief(input, billing),
    ).toMatchObject({ scope: { projectId: "p1" } });
    expect(state.related).toHaveBeenCalledTimes(2);
  });
  it("reuses an explicit unavailable page without a second outline request", async () => {
    state.instant.mockResolvedValue(null);
    const pageInput = { projectId: "p1", url: "https://example.com/" };
    expect(
      await ContentBriefService.analyzeCompetitorPage(pageInput, billing),
    ).toBeNull();
    expect(
      await ContentBriefService.analyzeCompetitorPage(pageInput, billing),
    ).toBeNull();
    expect(state.instant).toHaveBeenCalledTimes(1);
  });
  it("reuses successful empty observations without repeating paid lookups", async () => {
    const first = await ContentBriefService.getContentBrief(input, billing);
    expect(await ContentBriefService.getContentBrief(input, billing)).toEqual(
      first,
    );
    expect(state.related).toHaveBeenCalledTimes(1);
    expect(state.overview).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      contractVersion: 2,
      components: {
        serp: {
          fetchedAt: originalCapture,
          locationCode: 2840,
          languageCode: "en",
        },
        terms: { availability: "observed" },
      },
      scope: { projectId: "p1", organizationId: "org1", keyword: "coffee" },
    });
  });
  it("settles the R2 write before copying a saved run", async () => {
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    state.write.mockImplementation(async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const pending = ContentBriefService.getContentBrief(input, billing);
    await startedPromise;
    expect(state.record).not.toHaveBeenCalled();
    release();
    await pending;
    expect(state.record).toHaveBeenCalledTimes(1);
  });
  it("retains the paid result without saving older R2 data after a write failure", async () => {
    state.write.mockRejectedValue(new Error("isolated R2 failure"));
    const result = await ContentBriefService.getContentBrief(input, billing);
    expect(result).toMatchObject({ keyword: "coffee", competitors: [] });
    expect(state.record).not.toHaveBeenCalled();
    expect(state.related).toHaveBeenCalledTimes(1);
  });
  it("keeps failed related-term evidence unavailable with no invented capture", async () => {
    state.related.mockRejectedValue(new Error("isolated Labs failure"));
    expect(
      await ContentBriefService.getContentBrief(input, billing),
    ).toMatchObject({
      components: {
        serp: { fetchedAt: originalCapture },
        terms: { availability: "unavailable", fetchedAt: null },
      },
    });
  });
  it("keeps outline cache identity and captured observations project scoped", async () => {
    const pageInput = { projectId: "p1", url: "https://example.com/" };
    const first = await ContentBriefService.analyzeCompetitorPage(
      pageInput,
      billing,
    );
    expect(
      await ContentBriefService.analyzeCompetitorPage(pageInput, billing),
    ).toEqual(first);
    expect(first).toMatchObject({
      wordCount: 0,
      contractVersion: 2,
      scope: { projectId: "p1", organizationId: "org1", url: pageInput.url },
    });
    await ContentBriefService.analyzeCompetitorPage(
      { ...pageInput, projectId: "p2" },
      billing,
    );
    expect(state.instant).toHaveBeenCalledTimes(2);
  });
  it("keeps useful legacy brief rows while suppressing invalid derived metrics", () => {
    const legacy = contentBriefSchema.parse({
      keyword: "coffee",
      locationCode: 2840,
      languageCode: "en",
      fetchedAt: originalCapture,
      competitors: [
        {
          rank: -1,
          title: "coffee",
          url: "https://example.com",
          domain: "example.com",
        },
      ],
      terms: [{ keyword: "coffee", searchVolume: -10 }],
      paaQuestions: [],
    });
    expect(legacy.competitors[0].rank).toBeNull();
    expect(legacy.terms[0].searchVolume).toBeNull();
    expect(legacy.fetchedAt).toBe(originalCapture);
    expect(legacy.components).toBeUndefined();
  });
});
