import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBacklinksTimeline } from "./backlinks";

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  cache: new Map<string, unknown>(),
}));

// Invoke the production handler without the HTTP/runtime boundary. Provider,
// R2 and auth middleware imports are doubles; no external calls are possible.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(handler: unknown) {
      return handler;
    },
  }),
}));
vi.mock("@/serverFunctions/middleware", () => ({ requireProjectContext: [] }));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: {},
}));
vi.mock("@/server/features/backlinks/services/BacklinksService", () => ({
  BacklinksService: {},
}));
vi.mock("@/server/features/backlinks/services/BacklinksCompareService", () => ({
  BacklinksCompareService: {},
}));
vi.mock("@/server/lib/dataforseo", async () => {
  const target = await import("@/server/lib/dataforseoBacklinksTarget");
  return {
    normalizeBacklinksTarget: target.normalizeBacklinksTarget,
    createDataforseoClient: () => ({ backlinks: { history: mocks.history } }),
  };
});
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => mocks.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    mocks.cache.set(key, value);
  },
}));

const context = {
  projectId: "project-1",
  organizationId: "organization-1",
  userId: "user-1",
  userEmail: "test@example.com",
};
const request = {
  data: { projectId: "project-1", target: "www.example.com" },
  context,
};
const invoke = getBacklinksTimeline;

beforeEach(() => {
  mocks.cache.clear();
  mocks.history.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("backlinks history cache contract", () => {
  it("persists nullable events and reuses their original capture time without another provider call", async () => {
    mocks.history.mockResolvedValue([{ date: "2026-01-01", new_backlinks: 0 }]);
    const result = await invoke(request);
    expect(result.points[0]).toMatchObject({
      newBacklinks: 0,
      lostBacklinks: null,
    });
    vi.setSystemTime(new Date("2026-10-13T13:00:00Z"));
    expect(await invoke(request)).toEqual(result);
    expect(mocks.history).toHaveBeenCalledOnce();
    expect(mocks.history).toHaveBeenCalledWith({
      target: "example.com",
      dateFrom: "2025-11-01",
      dateTo: "2026-10-13",
    });
  });

  it("rejects legacy caches whose fabricated zero events cannot be distinguished from observations", async () => {
    mocks.cache.set(
      'backlinks:timeline:{"organizationId":"organization-1","target":"example.com"}',
      {
        points: [
          {
            date: "2026-01-01",
            referringDomains: 5,
            newReferringDomains: 0,
            lostReferringDomains: 0,
            newBacklinks: 0,
            lostBacklinks: 0,
          },
        ],
        fetchedAt: "2026-10-12T12:00:00.000Z",
      },
    );
    mocks.history.mockResolvedValue([
      { date: "2026-01-01", referring_domains: 5 },
    ]);
    expect((await invoke(request)).points[0]?.newBacklinks).toBeNull();
  });

  it("isolates organizations and targets while retaining same-organization target reuse", async () => {
    mocks.history.mockResolvedValue([{ date: "2026-01-01", new_backlinks: 0 }]);
    await invoke(request);
    await invoke({
      ...request,
      data: { ...request.data, target: "example.com" },
    });
    expect(mocks.history).toHaveBeenCalledTimes(1);
    const otherOrganizationRequest = {
      ...request,
      context: { ...context, organizationId: "organization-2" },
    };
    await invoke(otherOrganizationRequest);
    await invoke({
      ...request,
      data: { ...request.data, target: "other.com" },
    });
    expect(mocks.history).toHaveBeenCalledTimes(3);
  });

  it("does not invent observations from an empty or failed response", async () => {
    mocks.history.mockResolvedValue([]);
    expect((await invoke(request)).points).toEqual([]);
    mocks.history.mockRejectedValue(new Error("provider unavailable"));
    await expect(invoke(request)).rejects.toThrow("provider unavailable");
  });
});
