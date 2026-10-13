import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getProjectById: vi.fn(),
  getBrandLookup: vi.fn(),
  listForProject: vi.fn(),
  upsertDaily: vi.fn(),
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: mocks,
}));
vi.mock("./brandLookup", () => mocks);
vi.mock("../repositories/BrandVisibilitySnapshotRepository", () => ({
  BrandVisibilitySnapshotRepository: mocks,
}));
import { BrandVisibilityService } from "./brandVisibility";
const result = {
  contractVersion: 2 as const,
  source: "DataForSEO AI Optimization" as const,
  scope: { locationCode: 2840, languageCode: "en" },
  query: "example.com",
  resolvedTarget: "example.com",
  detectedTargetType: "domain" as const,
  fetchedAt: "2026-10-01T00:00:00Z",
  hasData: true,
  partialPlatforms: [],
  totalMentions: 0,
  totalAiSearchVolume: 0,
  perPlatform: [
    {
      platform: "google" as const,
      status: "success" as const,
      mentions: 0,
      aiSearchVolume: 0,
    },
  ],
  shareOfVoice: null,
  topPages: [],
  topQueries: [],
  monthlyVolume: [],
};
const customer = {
  organizationId: "fixture-org",
  userId: "fixture-user",
  userEmail: "fixture@example.test",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectById.mockResolvedValue({
    domain: "example.com",
    locationCode: 2840,
    languageCode: "en",
  });
});
it("stores a cached result on its original capture day, preserving known zero", async () => {
  mocks.getBrandLookup.mockResolvedValue(result);
  await BrandVisibilityService.analyze("project", customer);
  expect(mocks.upsertDaily).toHaveBeenCalledWith(
    "project",
    expect.objectContaining({ capturedOn: "2026-10-01", totalMentions: 0 }),
  );
});
it("does not relabel another market or uncertified legacy counts as current-market trend", async () => {
  const legacy = {
    ...result,
    contractVersion: undefined,
    scope: undefined,
    fetchedAt: "2026-10-03T00:00:00Z",
  };
  mocks.listForProject.mockResolvedValue([
    {
      target: "example.com",
      capturedOn: "2026-10-01",
      totalMentions: 55,
      resultJson: JSON.stringify(result),
    },
    {
      target: "example.com",
      capturedOn: "2026-10-02",
      totalMentions: 99,
      resultJson: JSON.stringify({
        ...result,
        scope: { locationCode: 2826, languageCode: "en" },
        fetchedAt: "2026-10-02T00:00:00Z",
      }),
    },
    {
      target: "example.com",
      capturedOn: "2026-10-03",
      totalMentions: 99,
      resultJson: JSON.stringify(legacy),
    },
  ]);
  const history = await BrandVisibilityService.history("project");
  expect(history.trend.series).toEqual([
    expect.objectContaining({ capturedOn: "2026-10-01", totalMentions: 0 }),
  ]);
  expect(history.latestResult!.fetchedAt).toBe(result.fetchedAt);
});
