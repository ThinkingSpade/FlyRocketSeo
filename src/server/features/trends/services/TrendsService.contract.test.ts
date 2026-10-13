import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  fetch: vi.fn(),
  record: vi
    .fn<
      (input: {
        cacheKey: string;
        params: Record<string, unknown>;
      }) => Promise<void>
    >()
    .mockResolvedValue(undefined),
  failWrite: false,
  delayWrite: null as Promise<void> | null,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ keywords: { trends: state.fetch } }),
}));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: state.record },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: unknown) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => state.cache.get(key),
  setCached: async (key: string, value: unknown) => {
    if (state.delayWrite) await state.delayWrite;
    if (state.failWrite) throw new Error("isolated R2 failure");
    state.cache.set(key, value);
  },
}));
import { TrendsService } from "./TrendsService";
import { trendsResultSchema } from "@/types/schemas/trends";
const input = {
  projectId: "p1",
  keywords: ["SEO Tools"],
  languageCode: "en",
  dateFrom: "2026-01-01",
  dateTo: "2026-02-01",
};
const billing = {
  organizationId: "org1",
  userId: "u1",
  userEmail: "u@example.com",
};
const graph = {
  type: "google_trends_graph",
  keywords: ["seo tools"],
  averages: [0],
  data: [
    {
      date_from: "2026-01-04",
      timestamp: 1767484800,
      values: [0],
      missing_data: true,
    },
    { date_from: "2026-01-11", timestamp: 1768089600, values: [0] },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.failWrite = false;
  state.delayWrite = null;
  state.fetch.mockResolvedValue([graph]);
});
afterEach(() => vi.useRealTimers());
describe("Trends captured observation persistence", () => {
  it("caches and records empty observations without repeat paid requests", async () => {
    state.fetch.mockResolvedValue([]);
    const first = await TrendsService.getTrends(input, billing);
    const second = await TrendsService.getTrends(input, billing);
    expect(second).toEqual(first);
    expect(state.fetch).toHaveBeenCalledTimes(1);
    expect(state.record).toHaveBeenCalledTimes(2);
  });
  it("awaits durable cache completion before copying the actual run payload", async () => {
    let release!: () => void;
    state.delayWrite = new Promise((resolve) => {
      release = resolve;
    });
    const pending = TrendsService.getTrends(input, billing);
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledOnce());
    expect(state.record).not.toHaveBeenCalled();
    release();
    await pending;
    const key = state.record.mock.calls[0][0].cacheKey;
    expect(state.cache.get(key)).toMatchObject({ keywords: ["seo tools"] });
  });
  it("retains paid results and skips history pointing to stale R2 when writes fail", async () => {
    state.failWrite = true;
    const result = await TrendsService.getTrends(input, billing);
    expect(result.points[1].values).toEqual([0]);
    expect(state.record).not.toHaveBeenCalled();
  });
  it("retains original source, project, window, capture and missing-data gaps through cache hits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    const result = await TrendsService.getTrends(input, billing);
    expect(result).toMatchObject({
      contractVersion: 2,
      dataSource: "DataForSEO Google Trends",
      fetchedAt: "2026-10-13T12:00:00.000Z",
      scope: {
        projectId: "p1",
        locationCode: null,
        languageCode: "en",
        dateFrom: "2026-01-01",
        dateTo: "2026-02-01",
      },
      points: [{ values: [null] }, { values: [0] }],
    });
    vi.advanceTimersByTime(60_000);
    expect(await TrendsService.getTrends(input, billing)).toEqual(result);
    await TrendsService.getTrends({ ...input, projectId: "p2" }, billing);
    await TrendsService.getTrends(input, {
      ...billing,
      organizationId: "org2",
    });
    expect(state.fetch).toHaveBeenCalledTimes(3);
    expect(state.record.mock.calls[0][0].params).toMatchObject({
      dateFrom: "2026-01-01",
      dateTo: "2026-02-01",
      contractVersion: 2,
    });
  });
  it("retains useful legacy curves without certifying source, scope or impossible scores", () => {
    const result = trendsResultSchema.parse({
      keywords: ["seo"],
      averages: [150],
      points: [
        { date: "2026-01-04", timestamp: 1767484800000, values: [0] },
        { date: "2026-01-11", timestamp: 1768089600000, values: [-1] },
      ],
      fetchedAt: "2026-01-15T00:00:00Z",
    });
    expect(result).toMatchObject({
      contractVersion: 1,
      dataSource: null,
      scope: null,
      points: [{ values: [0] }, { values: [null] }],
      averages: [null],
    });
  });
  it("captures explicit default windows and refreshes when the default calendar window advances", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    const request = {
      projectId: "p1",
      keywords: ["seo tools"],
      languageCode: "en",
    };
    expect(
      (await TrendsService.getTrends(request, billing)).scope,
    ).toMatchObject({ dateFrom: "2025-10-13", dateTo: "2026-10-13" });
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(
      (await TrendsService.getTrends(request, billing)).scope,
    ).toMatchObject({ dateFrom: "2025-10-14", dateTo: "2026-10-14" });
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });
  it("ignores a corrupted scoped cache without passing foreign evidence to the caller", async () => {
    await TrendsService.getTrends(input, billing);
    const [key, value] = [...state.cache.entries()][0];
    state.cache.set(key, {
      ...trendsResultSchema.parse(value),
      scope: {
        projectId: "foreign",
        locationCode: null,
        languageCode: "en",
        dateFrom: "2026-01-01",
        dateTo: "2026-02-01",
      },
    });
    const result = await TrendsService.getTrends(input, billing);
    expect(result.scope?.projectId).toBe("p1");
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });
});
