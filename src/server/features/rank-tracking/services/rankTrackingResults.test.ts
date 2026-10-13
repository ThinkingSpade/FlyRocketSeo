import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  getLatestSnapshotsForKeywords: vi.fn(),
  getSnapshotsBeforeDate: vi.fn(),
  getEarliestSnapshotsForKeywords: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: state }),
);
vi.mock("@/server/features/rank-tracking/rankTrackingTimestamps", () => ({
  toStoredTimestamp: (date: Date) => date.toISOString(),
}));
import { getLatestResults } from "./rankTrackingResults";
const config = {
  id: "config-1",
  projectId: "project-1",
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  devices: "both",
  serpDepth: 20,
};
const scopeJson = JSON.stringify({
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  serpDepth: 20,
});
const snapshot = {
  id: 1,
  runId: "run-1",
  trackingKeywordId: "kw-1",
  keyword: "alpha",
  device: "desktop",
  position: null,
  url: null,
  serpFeatures: null,
  checkedAt: "2026-10-01T00:00:00Z",
  scopeJson,
};
describe("rank results observation availability and scope", () => {
  beforeEach(() => {
    state.getConfigById.mockResolvedValue(config);
    state.getKeywordsForConfig.mockResolvedValue([
      {
        id: "kw-1",
        keyword: "alpha",
        searchVolume: 0,
        keywordDifficulty: null,
        cpc: 0,
        metricsScopeJson: JSON.stringify({
          locationCode: 2840,
          languageCode: "en",
        }),
      },
    ]);
    state.getLatestSnapshotsForKeywords.mockResolvedValue([snapshot]);
    state.getSnapshotsBeforeDate.mockResolvedValue([]);
    state.getEarliestSnapshotsForKeywords.mockResolvedValue([]);
  });
  it("does not relabel retained keyword estimates from another market", async () => {
    state.getKeywordsForConfig.mockResolvedValue([
      {
        id: "kw-1",
        keyword: "alpha",
        searchVolume: 100,
        keywordDifficulty: 40,
        cpc: 2,
        metricsScopeJson: JSON.stringify({
          locationCode: 2826,
          languageCode: "en",
        }),
      },
    ]);
    expect(
      (await getLatestResults("config-1", "project-1")).rows[0],
    ).toMatchObject({ searchVolume: null, keywordDifficulty: null, cpc: null });
  });
  it("distinguishes an observed absent rank from a device without a successful check", async () => {
    const result = await getLatestResults("config-1", "project-1");
    expect(result.rows[0]?.desktop).toMatchObject({
      availability: "observed",
      position: null,
      checkedAt: snapshot.checkedAt,
      comparisonAvailability: "unavailable",
    });
    expect(result.rows[0]?.mobile).toMatchObject({
      availability: "unavailable",
      position: null,
      checkedAt: null,
    });
    expect(result.rows[0]?.searchVolume).toBe(0);
  });
  it("does not relabel a previous domain/market/depth observation after configuration changes", async () => {
    state.getLatestSnapshotsForKeywords.mockResolvedValue([
      {
        ...snapshot,
        position: 3,
        scopeJson: JSON.stringify({
          domain: "other.example",
          locationCode: 2840,
          languageCode: "en",
          serpDepth: 20,
        }),
      },
    ]);
    const result = await getLatestResults("config-1", "project-1");
    expect(result.rows[0]?.desktop).toMatchObject({
      availability: "unavailable",
      position: null,
    });
    expect(result.run).toBeNull();
  });
  it("does not use a legacy unknown-scope observation for current ranking or comparisons", async () => {
    state.getLatestSnapshotsForKeywords.mockResolvedValue([
      { ...snapshot, position: 3, scopeJson: null },
    ]);
    state.getSnapshotsBeforeDate.mockResolvedValue([
      { ...snapshot, position: 2, scopeJson: null },
    ]);
    expect(
      (await getLatestResults("config-1", "project-1")).rows[0]?.desktop,
    ).toMatchObject({
      availability: "unavailable",
      previousPosition: null,
      comparisonAvailability: "unavailable",
    });
  });
  it("never treats a malformed stored position or metrics as measured evidence", async () => {
    state.getLatestSnapshotsForKeywords.mockResolvedValue([
      { ...snapshot, position: -1 },
    ]);
    state.getKeywordsForConfig.mockResolvedValue([
      {
        id: "kw-1",
        keyword: "alpha",
        searchVolume: 0.5,
        keywordDifficulty: 101,
        cpc: -1,
      },
    ]);
    expect(
      (await getLatestResults("config-1", "project-1")).rows[0],
    ).toMatchObject({
      searchVolume: null,
      keywordDifficulty: null,
      cpc: null,
      desktop: { availability: "unavailable", position: null },
    });
  });
});
