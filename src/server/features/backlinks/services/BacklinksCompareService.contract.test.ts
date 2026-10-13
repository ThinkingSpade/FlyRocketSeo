import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getCached: vi.fn(),
  setCached: vi.fn(async () => undefined),
  buildCacheKey: vi.fn(
    async (prefix: string, params: unknown) => prefix + JSON.stringify(params),
  ),
  competitors: vi.fn(),
  bulkRanks: vi.fn(),
  bulkBacklinks: vi.fn(),
  bulkReferringDomains: vi.fn(),
  bulkNewLostReferringDomains: vi.fn(),
  bulkSpamScores: vi.fn(),
}));
vi.mock("@/server/lib/r2-cache", () => mocks);
vi.mock("@/server/lib/dataforseo", async () => ({
  ...(await vi.importActual("@/shared/backlink-targets")),
  normalizeBacklinksTarget: (target: string) => ({ apiTarget: target }),
  createDataforseoClient: () => ({ backlinks: mocks }),
}));
import { BacklinksCompareService } from "./BacklinksCompareService";
const customer = {
  organizationId: "fixture-org",
  userId: "fixture-user",
  userEmail: "fixture@example.test",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCached.mockResolvedValue(null);
  mocks.competitors.mockResolvedValue({ items: [], totalCount: 0 });
});
it("scopes cache reuse to the authorized project and preserves a genuinely empty paid response", async () => {
  await BacklinksCompareService.competingDomains(
    { projectId: "project-a", target: "example.com" },
    customer,
  );
  await BacklinksCompareService.competingDomains(
    { projectId: "project-b", target: "example.com" },
    customer,
  );
  expect(mocks.buildCacheKey.mock.calls.map((call) => call[1])).toEqual([
    expect.objectContaining({ projectId: "project-a" }),
    expect.objectContaining({ projectId: "project-b" }),
  ]);
  expect(mocks.setCached).toHaveBeenCalledTimes(2);
});
