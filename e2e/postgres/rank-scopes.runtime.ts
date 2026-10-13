import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, withPgClient } from "@/db";
import {
  rankCheckRuns,
  rankSnapshots,
  rankTrackingConfigs,
  rankTrackingKeywords,
} from "@/db/schema";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
import {
  keywordMetricsScopeJson,
  rankScopeJson,
} from "@/server/features/rank-tracking/rankObservationScope";
import { scope } from "./runtime.fixture";

const config = {
  id: "rank-config-a",
  projectId: scope.projectId,
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  devices: "both" as const,
  serpDepth: 20,
};
async function seedRank() {
  await db.insert(rankTrackingConfigs).values(config);
  await db.insert(rankTrackingKeywords).values({
    id: "rank-kw-a",
    configId: config.id,
    keyword: "alpha",
    searchVolume: 0,
    cpc: 0,
    metricsScopeJson: keywordMetricsScopeJson(config),
    metricsFetchedAt: "2026-10-01T00:00:00.000Z",
  });
  await RankTrackingRepository.tryCreateRun({
    id: "rank-run-a",
    configId: config.id,
    projectId: config.projectId,
    keywordsTotal: 1,
    scopeJson: rankScopeJson(config),
  });
  await RankTrackingRepository.insertSnapshots([
    {
      runId: "rank-run-a",
      trackingKeywordId: "rank-kw-a",
      keyword: "alpha",
      device: "desktop",
      position: 8,
      url: "https://example.com/",
      serpFeatures: null,
    },
  ]);
  await RankTrackingRepository.updateRun("rank-run-a", {
    status: "completed",
    completedAt: "2026-10-13T12:00:00.000Z",
  });
}

describe("PostgreSQL rank evidence scopes", () => {
  it("runs the production rank repository and result mapping against persisted scope and genuine zero metrics", async () =>
    withPgClient(async () => {
      await seedRank();
      const result = await getLatestResults(config.id, config.projectId);
      expect(result.rows[0]).toMatchObject({
        searchVolume: 0,
        cpc: 0,
        desktop: { position: 8, availability: "observed" },
        mobile: { position: null, availability: "unavailable" },
      });
      expect(
        await RankTrackingRepository.getConfigTrend(config.id, "desktop", 730),
      ).toMatchObject([{ total: 1, top3: 0, top4to10: 1, top11to20: 0 }]);
      expect(
        await RankTrackingRepository.getPositionMatrix(
          config.id,
          "desktop",
          12,
        ),
      ).toMatchObject([{ runId: "rank-run-a", position: 8 }]);
    }));
  it("keeps previous scope observations persisted while excluding them after a target/depth or market change", async () =>
    withPgClient(async () => {
      await seedRank();
      await db
        .update(rankTrackingConfigs)
        .set({ domain: "new.example", serpDepth: 40, locationCode: 2826 })
        .where(eq(rankTrackingConfigs.id, config.id));
      expect(
        (await getLatestResults(config.id, config.projectId)).rows[0],
      ).toMatchObject({
        searchVolume: null,
        cpc: null,
        desktop: { availability: "unavailable", position: null },
      });
      expect(
        await RankTrackingRepository.getKeywordHistory(
          config.id,
          "rank-kw-a",
          730,
        ),
      ).toEqual([]);
      expect(await db.select().from(rankSnapshots)).toHaveLength(1);
    }));
  it("denies a different project's rank results and does not certify legacy runs with missing scope", async () =>
    withPgClient(async () => {
      await seedRank();
      await expect(
        getLatestResults(config.id, "project-b"),
      ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
      await db
        .update(rankCheckRuns)
        .set({ scopeJson: null })
        .where(eq(rankCheckRuns.id, "rank-run-a"));
      expect(
        (await getLatestResults(config.id, config.projectId)).rows[0]?.desktop
          .availability,
      ).toBe("unavailable");
    }));
});
