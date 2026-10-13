import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  write: vi.fn(),
  record: vi.fn(),
  live: vi.fn(),
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
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ serp: { live: state.live } }),
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
beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.live.mockResolvedValue([]);
  state.write.mockImplementation(async (key: string, value: unknown) => {
    state.cache.set(key, value);
  });
});
describe("Citation capture and durable reuse", () => {
  it("reuses a successful empty search with its original source, capture and scope", async () => {
    const first = await CitationTrackerService.getCitationReport(
      input,
      customer,
    );
    expect(
      await CitationTrackerService.getCitationReport(input, customer),
    ).toEqual(first);
    expect(state.live).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      contractVersion: 2,
      source: "DataForSEO Google Organic SERP",
      scope: { organizationId: "org1", projectId: "p1", phone: "123" },
    });
  });
  it("does not reuse another captured phone under an otherwise identical search", async () => {
    state.live.mockResolvedValue([
      {
        type: "organic",
        domain: "directory.example",
        url: "https://directory.example/rocket",
        title: "Rocket business",
      },
    ]);
    const first = await CitationTrackerService.getCitationReport(
      input,
      customer,
    );
    expect(first.phone).toBe("123");
    expect(
      await CitationTrackerService.getCitationReport(
        { ...input, phone: "456" },
        customer,
      ),
    ).toMatchObject({ phone: "456" });
    expect(state.live).toHaveBeenCalledTimes(2);
  });
  it("waits for cache persistence before copying run history", async () => {
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    state.write.mockImplementation(async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const pending = CitationTrackerService.getCitationReport(input, customer);
    await waiting;
    expect(state.record).not.toHaveBeenCalled();
    release();
    await pending;
    expect(state.record).toHaveBeenCalledTimes(1);
  });
  it("returns the paid result without copying stale R2 when persistence fails", async () => {
    state.write.mockRejectedValue(new Error("isolated cache failure"));
    expect(
      await CitationTrackerService.getCitationReport(input, customer),
    ).toMatchObject({ results: [] });
    expect(state.record).not.toHaveBeenCalled();
    expect(state.live).toHaveBeenCalledTimes(1);
  });
});
