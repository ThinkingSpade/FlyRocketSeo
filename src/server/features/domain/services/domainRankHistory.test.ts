import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRankHistory } from "./domainRankHistory";

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  cache: new Map<string, unknown>(),
}));

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => mocks.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    mocks.cache.set(key, value);
  },
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    domain: { historicalRankOverview: mocks.history },
  }),
}));

const input = {
  projectId: "project-1",
  domain: "www.example.com",
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
  mocks.history.mockReset();
});

describe("domain historical rank evidence", () => {
  it("does not publish a top-three total beyond the exact integer range", async () => {
    mocks.history.mockResolvedValue([
      {
        year: 2026,
        month: 1,
        metrics: { organic: { pos_1: Number.MAX_SAFE_INTEGER, pos_2_3: 1 } },
      },
    ]);
    expect((await getRankHistory(input, customer)).points[0]?.top3).toBeNull();
  });

  it("requires both top-three buckets and preserves complete zero observations", async () => {
    mocks.history.mockResolvedValue([
      {
        year: 2026,
        month: 6,
        metrics: { organic: { pos_1: 7, count: 100, etv: 12.5 } },
      },
      { year: 2026, month: 5, metrics: { organic: { pos_2_3: 4 } } },
      {
        year: 2026,
        month: 3,
        metrics: { organic: { pos_1: 0, pos_2_3: 0, count: 0, etv: 0 } },
      },
      { year: 2026, month: 2, metrics: { organic: { pos_1: 2, pos_2_3: 3 } } },
      { year: 2026, month: 1 },
    ]);

    const result = await getRankHistory(input, customer);
    expect(result.points).toEqual([
      {
        date: "2026-01",
        organicKeywords: null,
        organicTraffic: null,
        top3: null,
      },
      { date: "2026-02", organicKeywords: null, organicTraffic: null, top3: 5 },
      { date: "2026-03", organicKeywords: 0, organicTraffic: 0, top3: 0 },
      {
        date: "2026-05",
        organicKeywords: null,
        organicTraffic: null,
        top3: null,
      },
      {
        date: "2026-06",
        organicKeywords: 100,
        organicTraffic: 12.5,
        top3: null,
      },
    ]);
  });

  it("omits invalid months and leaves invalid metrics unknown", async () => {
    mocks.history.mockResolvedValue([
      { year: 2026, month: 0 },
      { year: 2026, month: 13 },
      { year: 2026.5, month: 1 },
      { month: 1 },
      {
        year: 2026,
        month: 1,
        metrics: {
          organic: {
            count: -1,
            etv: Number.POSITIVE_INFINITY,
            pos_1: 2,
            pos_2_3: Number.NaN,
          },
        },
      },
    ]);
    expect((await getRankHistory(input, customer)).points).toEqual([
      {
        date: "2026-01",
        organicKeywords: null,
        organicTraffic: null,
        top3: null,
      },
    ]);
  });

  it("does not reuse legacy mapped cache values that concealed partial buckets", async () => {
    const key =
      'domain:rank-history:{"organizationId":"organization-1","projectId":"project-1","domain":"example.com","locationCode":2840,"languageCode":"en"}';
    mocks.cache.set(key, {
      points: [
        { date: "2026-01", organicKeywords: 10, organicTraffic: 2, top3: 7 },
      ],
      fetchedAt: "2026-10-12T12:00:00.000Z",
    });
    mocks.history.mockResolvedValue([
      {
        year: 2026,
        month: 1,
        metrics: { organic: { count: 10, etv: 2, pos_1: 7 } },
      },
    ]);
    expect((await getRankHistory(input, customer)).points[0]?.top3).toBeNull();
  });

  it("retains capture time on reuse and isolates organization, project, target and market", async () => {
    mocks.history.mockResolvedValue([
      { year: 2026, month: 1, metrics: { organic: { count: 10 } } },
    ]);
    const result = await getRankHistory(input, customer);
    await getRankHistory(input, customer);
    expect(mocks.history).toHaveBeenCalledTimes(1);
    expect((await getRankHistory(input, customer)).fetchedAt).toBe(
      result.fetchedAt,
    );
    await getRankHistory(input, {
      ...customer,
      organizationId: "organization-2",
    });
    await getRankHistory({ ...input, projectId: "project-2" }, customer);
    await getRankHistory({ ...input, domain: "other.com" }, customer);
    await getRankHistory({ ...input, locationCode: 2826 }, customer);
    await getRankHistory({ ...input, languageCode: "fr" }, customer);
    expect(mocks.history).toHaveBeenCalledTimes(6);
  });

  it("keeps empty history empty and propagates failures without success-looking observations", async () => {
    mocks.history.mockResolvedValue([]);
    expect((await getRankHistory(input, customer)).points).toEqual([]);
    mocks.history.mockRejectedValue(new Error("provider unavailable"));
    await expect(getRankHistory(input, customer)).rejects.toThrow(
      "provider unavailable",
    );
  });
});
