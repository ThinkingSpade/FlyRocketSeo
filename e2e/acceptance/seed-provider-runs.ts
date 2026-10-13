import type { DrizzleD1Database } from "drizzle-orm/d1";
import { analysisRuns } from "../../src/db/app.schema";
import { domainOverviewResultSchema } from "../../src/types/schemas/domain";
import { backlinksOverviewCacheSchema } from "../../src/types/schemas/backlinks-results";
import { getFixtureOverview } from "../fixtures/domain-overview-fixtures";
import { PROJECT_A2 } from "./data";

export async function seedProviderRuns(db: DrizzleD1Database, r2: R2Bucket) {
  const capturedAt = "2026-05-19T00:00:00.000Z";
  const domain = domainOverviewResultSchema.parse({
    ...getFixtureOverview("partial.example.com"),
    contractVersion: 2,
    source: "DataForSEO Labs",
    scope: { locationCode: 2840, languageCode: "en", includeSubdomains: true },
  });
  const backlinks = backlinksOverviewCacheSchema.parse({
    overview: {
      contractVersion: 2,
      target: "partial.example.com",
      displayTarget: "partial.example.com",
      scope: "domain",
      summary: {
        rank: null,
        backlinks: 200,
        referringPages: 100,
        referringDomains: 20,
        brokenBacklinks: 0,
        brokenPages: null,
        backlinksSpamScore: null,
        targetSpamScore: null,
        newBacklinks: 5,
        lostBacklinks: null,
        newReferringDomains: 0,
        lostReferringDomains: null,
      },
      trends: [
        { date: "2026-01-01", backlinks: 100, referringDomains: 10, rank: 20 },
        {
          date: "2026-02-01",
          backlinks: null,
          referringDomains: null,
          rank: null,
        },
        { date: "2026-03-01", backlinks: 200, referringDomains: 20, rank: 40 },
      ],
      newLostTrends: [
        {
          date: "2026-01-01",
          newBacklinks: 5,
          lostBacklinks: 1,
          newReferringDomains: 0,
          lostReferringDomains: 0,
        },
        {
          date: "2026-02-01",
          newBacklinks: null,
          lostBacklinks: null,
          newReferringDomains: null,
          lostReferringDomains: null,
        },
        {
          date: "2026-03-01",
          newBacklinks: 15,
          lostBacklinks: 3,
          newReferringDomains: 2,
          lostReferringDomains: 1,
        },
      ],
      fetchedAt: capturedAt,
    },
  });
  for (const item of [
    {
      feature: "domain_overview",
      cacheKey: "acceptance-partial-domain",
      result: domain,
      params: {
        domain: "partial.example.com",
        locationCode: 2840,
        languageCode: "en",
        includeSubdomains: true,
      },
    },
    {
      feature: "backlinks",
      cacheKey: "acceptance-partial-backlinks",
      result: backlinks,
      params: { target: "partial.example.com", scope: "domain" },
    },
  ]) {
    await r2.put(`analysis-runs/${item.cacheKey}`, JSON.stringify(item.result));
    await db.insert(analysisRuns).values({
      id: item.cacheKey,
      projectId: PROJECT_A2,
      feature: item.feature,
      paramsJson: JSON.stringify(item.params),
      cacheKey: item.cacheKey,
      label: "partial.example.com",
      ranBy: "acceptance-user-a",
      runCount: 1,
      createdAt: capturedAt,
      lastRanAt: capturedAt,
    });
  }
}
