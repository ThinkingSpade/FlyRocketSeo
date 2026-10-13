import { beforeEach, expect, it, vi } from "vitest";
import { DomainService } from "./DomainService";
import { domainOverviewResultSchema } from "@/types/schemas/domain";

const mocks = vi.hoisted(() => ({
  rankOverview: vi.fn(),
  record: vi.fn(),
  beforePut: vi.fn<() => Promise<void>>(),
  initialCachedValue: null as unknown,
  cache: new Map<string, unknown>(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    domain: { rankOverview: mocks.rankOverview },
  }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) =>
    mocks.cache.get(key) ?? mocks.initialCachedValue,
  setCached: async (key: string, value: unknown) => {
    await mocks.beforePut();
    mocks.cache.set(key, value);
  },
}));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: mocks.record },
}));

const input = {
  projectId: "project-1",
  domain: "www.example.com",
  includeSubdomains: true,
  locationCode: 2840,
  languageCode: "en",
};
const customer = {
  organizationId: "organization-1",
  userId: "user-1",
  userEmail: "test@example.com",
};
beforeEach(() => {
  mocks.cache.clear();
  vi.clearAllMocks();
  mocks.initialCachedValue = null;
  mocks.beforePut.mockReset().mockResolvedValue(undefined);
  mocks.record.mockReset();
});

it.each([
  null,
  {
    domain: "example.com",
    organicTraffic: 7,
    organicKeywords: 7,
    backlinks: null,
    referringDomains: null,
    positionBuckets: null,
    hasData: true,
    fetchedAt: "2026-01-01T00:00:00.000Z",
  },
])(
  "records the newly settled cache payload when a delayed put replaces %j",
  async (previous) => {
    mocks.initialCachedValue = previous;
    mocks.rankOverview.mockResolvedValue([
      { metrics: { organic: { count: 12, etv: 12.5 } } },
    ]);
    let releasePut: () => void = vi.fn();
    let markPutStarted: () => void = vi.fn();
    const delayedPut = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    const putStarted = new Promise<void>((resolve) => {
      markPutStarted = resolve;
    });
    mocks.beforePut.mockImplementationOnce(async () => {
      markPutStarted();
      await delayedPut;
    });
    let savedPayload: unknown;
    mocks.record.mockImplementation(
      async ({ cacheKey }: { cacheKey: string }) => {
        savedPayload = mocks.cache.get(cacheKey) ?? mocks.initialCachedValue;
      },
    );
    const resultPromise = DomainService.getOverview(input, customer);
    await putStarted;
    const recordsBeforePutSettled = mocks.record.mock.calls.length;
    releasePut();
    const result = await resultPromise;
    expect(recordsBeforePutSettled).toBe(0);
    expect(savedPayload).toEqual(result);
    expect(savedPayload).toMatchObject({
      organicKeywords: 12,
      organicTraffic: 12.5,
      fetchedAt: result.fetchedAt,
    });
  },
);

it("keeps the paid result available and logs a failed cache put before best-effort recording", async () => {
  const error = new Error("isolated R2 put failure");
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.beforePut.mockRejectedValueOnce(error);
  mocks.rankOverview.mockResolvedValue([
    { metrics: { organic: { count: 12 } } },
  ]);
  try {
    const result = await DomainService.getOverview(input, customer);
    expect(result.organicKeywords).toBe(12);
    expect(logged).toHaveBeenCalledWith(
      "domain.overview.cache-write failed:",
      error,
    );
    expect(mocks.record).toHaveBeenCalledOnce();
  } finally {
    logged.mockRestore();
  }
});

it("keeps partial rank buckets unknown and preserves estimate precision through cached and saved payloads", async () => {
  mocks.rankOverview.mockResolvedValue([
    { metrics: { organic: { count: 12, etv: 12.5, pos_1: 7, pos_4_10: 0 } } },
  ]);
  const first = await DomainService.getOverview(input, customer);
  expect(first.organicTraffic).toBe(12.5);
  expect(first.positionBuckets).toEqual({
    top3: null,
    pos4to10: 0,
    pos11to20: null,
    pos21to50: null,
    pos51plus: null,
  });
  const restored = domainOverviewResultSchema.parse(
    JSON.parse(JSON.stringify(first)),
  );
  expect(restored).toEqual(first);
  expect(await DomainService.getOverview(input, customer)).toEqual(first);
  expect(mocks.rankOverview).toHaveBeenCalledOnce();
  expect(first).toMatchObject({
    contractVersion: 2,
    source: "DataForSEO Labs",
    scope: { locationCode: 2840, languageCode: "en", includeSubdomains: true },
  });
});

it("caches successfully observed zero instead of charging to rediscover it", async () => {
  mocks.rankOverview.mockResolvedValue([
    {
      metrics: {
        organic: {
          count: 0,
          etv: 0,
          pos_1: 0,
          pos_2_3: 0,
          pos_4_10: 0,
          pos_11_20: 0,
          pos_21_30: 0,
          pos_31_40: 0,
          pos_41_50: 0,
          pos_51_60: 0,
          pos_61_70: 0,
          pos_71_80: 0,
          pos_81_90: 0,
          pos_91_100: 0,
        },
      },
    },
  ]);
  const result = await DomainService.getOverview(input, customer);
  expect(result).toMatchObject({
    organicKeywords: 0,
    organicTraffic: 0,
    hasData: true,
    positionBuckets: { top3: 0, pos51plus: 0 },
  });
  expect(await DomainService.getOverview(input, customer)).toEqual(result);
  expect(mocks.rankOverview).toHaveBeenCalledOnce();
});

it("nulls fractional, negative, nonfinite and overflowing counts independently", async () => {
  mocks.rankOverview.mockResolvedValue([
    {
      metrics: {
        organic: {
          count: 1.5,
          etv: -1,
          pos_1: Number.MAX_SAFE_INTEGER,
          pos_2_3: 1,
          pos_4_10: -1,
          pos_11_20: Number.POSITIVE_INFINITY,
          pos_21_30: 1,
          pos_31_40: 2,
          pos_41_50: 3,
        },
      },
    },
  ]);
  const result = await DomainService.getOverview(input, customer);
  expect(result.organicKeywords).toBeNull();
  expect(result.organicTraffic).toBeNull();
  expect(result.positionBuckets).toEqual({
    top3: null,
    pos4to10: null,
    pos11to20: null,
    pos21to50: 6,
    pos51plus: null,
  });
});

it("does not certify synthesized buckets in legacy saved runs", () => {
  const restored = domainOverviewResultSchema.parse({
    domain: "example.com",
    organicTraffic: 15,
    organicKeywords: 12,
    backlinks: null,
    referringDomains: null,
    positionBuckets: {
      top3: 7,
      pos4to10: 0,
      pos11to20: 0,
      pos21to50: 0,
      pos51plus: 0,
    },
    hasData: true,
    fetchedAt: "2026-10-01T00:00:00.000Z",
  });
  expect(restored.positionBuckets).toBeNull();
  expect(restored.fetchedAt).toBe("2026-10-01T00:00:00.000Z");
});

it("isolates cached overviews by organization, project, market and target", async () => {
  mocks.rankOverview.mockResolvedValue([
    { metrics: { organic: { count: 2 } } },
  ]);
  await DomainService.getOverview(input, customer);
  await DomainService.getOverview(input, {
    ...customer,
    organizationId: "organization-2",
  });
  await DomainService.getOverview(
    { ...input, projectId: "project-2" },
    customer,
  );
  await DomainService.getOverview({ ...input, locationCode: 2826 }, customer);
  await DomainService.getOverview({ ...input, domain: "other.com" }, customer);
  expect(mocks.rankOverview).toHaveBeenCalledTimes(5);
});
