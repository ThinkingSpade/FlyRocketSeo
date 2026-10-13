import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  write: vi.fn(),
  record: vi.fn(),
  spent: vi.fn(),
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
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "citation-http-fixture-key",
  isHostedServerAuthMode: async () => true,
}));
vi.mock("@/server/billing/subscription", () => ({
  assertUsageCreditsAvailable: async () => ({ monthlyRemaining: 100 }),
  getOrCreateOrganizationCustomer: async () => ({ id: "fixture-customer" }),
  trackUsageCreditSpend: state.spent,
}));

import { CitationTrackerService } from "./CitationTrackerService";

const input = {
  projectId: "p1",
  businessName: "Rocket business",
  city: "Dallas",
  phone: "123",
  locationCode: 2840,
  languageCode: "en",
};
const customer = {
  organizationId: "org1",
  userId: "u1",
  userEmail: "u@test.invalid",
};
const scope = {
  keyword: "Rocket business Dallas",
  location_code: 2840,
  language_code: "en",
  device: "desktop",
};
const path = ["v3", "serp", "google", "organic", "live", "advanced"];
function fixture(overrides: Record<string, unknown> = {}) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        id: "citation-empty-task",
        status_code: 40102,
        status_message: "No Search Results.",
        result_count: 1,
        cost: 0.002,
        path,
        data: { ...scope, location_code: "2840" },
        result: [
          { ...scope, se_results_count: 0, items_count: 0, items: null },
        ],
        ...overrides,
      },
    ],
  });
}

beforeAll(async () => {
  await import("@/server/lib/dataforseo/fetchers");
}, 30_000);
beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.write.mockImplementation(async (key: string, value: unknown) => {
    state.cache.set(key, value);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Citation Tracker through the actual HTTP SDK and billing adapter", () => {
  it("caches and copies a documented 40102 empty capture without repeating its paid POST", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T10:00:00.000Z"));
    const transport = vi.fn().mockResolvedValue(fixture());
    vi.stubGlobal("fetch", transport);
    const first = await CitationTrackerService.getCitationReport(
      input,
      customer,
    );
    vi.setSystemTime(new Date("2026-10-13T11:00:00.000Z"));
    expect(
      await CitationTrackerService.getCitationReport(input, customer),
    ).toEqual(first);
    expect(first).toMatchObject({
      source: "DataForSEO Google Organic SERP",
      scope: {
        organizationId: "org1",
        projectId: "p1",
        locationCode: 2840,
        languageCode: "en",
      },
      results: [],
    });
    expect(first.fetchedAt).toBe("2026-10-13T10:00:00.000Z");
    expect(transport).toHaveBeenCalledOnce();
    expect(state.spent).toHaveBeenCalledOnce();
    expect(state.spent).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "fixture-customer",
        creditFeature: "local_seo",
        costUsd: 0.002,
        properties: {
          provider: "dataforseo",
          paths: [path.join("/")],
          fromCache: false,
        },
      }),
    );
    expect(state.write).toHaveBeenCalledOnce();
    expect(state.record).toHaveBeenCalledTimes(2);
    expect(state.record.mock.calls[1]?.[0]).toEqual(
      state.record.mock.calls[0]?.[0],
    );
  });

  it.each([
    ["foreign empty market", { data: { ...scope, location_code: 2826 } }],
    [
      "malformed nonempty payload",
      { result: [{ ...scope, items: ["malformed"] }] },
    ],
    ["missing sentinel payload", { result: undefined }],
    ["null sentinel payload", { result: null }],
  ])(
    "meters %s once without saving an invented empty capture",
    async (_name, overrides) => {
      const transport = vi.fn().mockResolvedValue(fixture(overrides));
      vi.stubGlobal("fetch", transport);
      await expect(
        CitationTrackerService.getCitationReport(input, customer),
      ).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        billing: { path, costUsd: 0.002 },
      });
      expect(transport).toHaveBeenCalledOnce();
      expect(state.spent).toHaveBeenCalledOnce();
      expect(state.spent.mock.calls[0]?.[0]).toMatchObject({
        creditFeature: "local_seo",
        costUsd: 0.002,
      });
      expect(state.write).not.toHaveBeenCalled();
      expect(state.record).not.toHaveBeenCalled();
    },
  );
});
