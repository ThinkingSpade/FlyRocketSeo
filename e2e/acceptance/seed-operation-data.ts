import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as app from "../../src/db/app.schema";
import * as gsc from "../../src/db/gsc.schema";
import { expiredDomainsResultSchema } from "../../src/types/schemas/expiredDomains";
import { OPERATION_RANK_CONFIG, ORG_A, PROJECT_OPERATIONS } from "./data";

export async function seedOperationData(db: DrizzleD1Database, r2: R2Bucket) {
  await db.insert(app.projects).values({
    id: PROJECT_OPERATIONS,
    organizationId: ORG_A,
    name: "Tool operation acceptance",
    domain: "operation.example",
  });
  await db.insert(gsc.gscConnections).values({
    id: "fixture-gsc-operations",
    projectId: PROJECT_OPERATIONS,
    organizationId: ORG_A,
    siteUrl: "sc-domain:operation.example",
    connectedByUserId: "acceptance-user-a",
    connectedAccountEmail: "acceptance-a@example.com",
  });
  await db.insert(app.audits).values({
    id: "operation-audit",
    projectId: PROJECT_OPERATIONS,
    startedByUserId: "acceptance-user-a",
    startUrl: "https://operation.example",
    status: "completed",
    pagesCrawled: 2,
    pagesTotal: 2,
    startedAt: "2026-09-29T11:50:00.000Z",
    completedAt: "2026-09-29T12:00:00.000Z",
  });
  await db.insert(app.auditPages).values([
    {
      id: "operation-page-guide",
      auditId: "operation-audit",
      url: "https://operation.example/guide",
      statusCode: 200,
      title: "",
      metaDescription: "",
      h1Count: 1,
      wordCount: 650,
    },
    {
      id: "operation-page-healthy",
      auditId: "operation-audit",
      url: "https://operation.example/healthy",
      statusCode: 200,
      title: "Healthy operation page",
      metaDescription: "Healthy operation metadata",
      h1Count: 1,
      wordCount: 700,
    },
  ]);
  await db.insert(app.rankTrackingConfigs).values({
    id: OPERATION_RANK_CONFIG,
    projectId: PROJECT_OPERATIONS,
    domain: "operation.example",
    locationCode: 2840,
    languageCode: "en",
    devices: "both",
    serpDepth: 40,
    scheduleInterval: "manual",
    lastCheckedAt: "2026-09-29T12:00:00.000Z",
  });
  await db.insert(app.rankTrackingKeywords).values([
    {
      id: "operation-rank-observed",
      configId: OPERATION_RANK_CONFIG,
      keyword: "operation observed rocket",
      searchVolume: 0,
      keywordDifficulty: 0,
      cpc: 0,
      metricsFetchedAt: "2026-09-29T12:00:00.000Z",
      metricsScopeJson: JSON.stringify({
        locationCode: 2840,
        languageCode: "en",
      }),
    },
    {
      id: "operation-rank-unchecked",
      configId: OPERATION_RANK_CONFIG,
      keyword: "operation unchecked rocket",
      searchVolume: null,
      keywordDifficulty: null,
      cpc: null,
    },
  ]);
  await db.insert(app.rankCheckRuns).values({
    id: "operation-rank-completed",
    scopeJson: JSON.stringify({
      domain: "operation.example",
      locationCode: 2840,
      languageCode: "en",
      serpDepth: 40,
    }),
    configId: OPERATION_RANK_CONFIG,
    projectId: PROJECT_OPERATIONS,
    status: "completed",
    keywordsTotal: 1,
    keywordsChecked: 1,
    startedAt: "2026-09-29T11:59:00.000Z",
    completedAt: "2026-09-29T12:00:00.000Z",
  });
  await db.insert(app.rankSnapshots).values([
    {
      runId: "operation-rank-completed",
      trackingKeywordId: "operation-rank-observed",
      keyword: "operation observed rocket",
      device: "desktop",
      position: 8,
      url: "https://operation.example/guide",
      checkedAt: "2026-09-29T12:00:00.000Z",
    },
    {
      runId: "operation-rank-completed",
      trackingKeywordId: "operation-rank-observed",
      keyword: "operation observed rocket",
      device: "mobile",
      position: null,
      url: null,
      checkedAt: "2026-09-29T12:00:00.000Z",
    },
  ]);
  const expired = expiredDomainsResultSchema.parse({
    rows: ["expired", "warning"].map((status, index) => ({
      domain: `operation-domain-${index + 1}.example`,
      sources: ["fixture-history"],
      evidence: {
        linksToCompetitors: ["competitor.example"],
        ranksForKeywords: ["rocket"],
        isKnownCompetitor: false,
      },
      score: 2 - index,
      status,
      expiration: {
        domain: `operation-domain-${index + 1}.example`,
        expirationDate: index === 0 ? "2026-09-01" : "2026-11-01",
        createdDate: null,
        lastUpdatedDate: null,
        daysToExpiration: index === 0 ? -42 : 19,
        domainAgeDays: null,
        domainAgeYears: null,
        daysSinceLastUpdate: null,
        status,
      },
      available: index === 0 ? null : false,
    })),
    summary: { checked: 2, surfaced: 2, failed: 0 },
    sourcesUsed: ["fixture-history"],
    sourceErrors: [],
    sourcesSkipped: [],
    acquirable: null,
  });
  await r2.put("analysis-runs/operation-expired-run", JSON.stringify(expired));
  await db.insert(app.analysisRuns).values({
    id: "operation-expired-run",
    projectId: PROJECT_OPERATIONS,
    feature: "expired_domains",
    paramsJson: JSON.stringify({ domain: "operation.example", cap: 50 }),
    cacheKey: "operation-expired-run",
    label: "operation.example",
    runCount: 1,
    createdAt: "2026-09-29T12:00:00.000Z",
    lastRanAt: "2026-09-29T12:00:00.000Z",
  });
}
