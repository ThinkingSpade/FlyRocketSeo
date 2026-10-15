import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import {
  analysisRuns,
  auditLighthouseResults,
  auditPages,
  audits,
  gscConnections,
  rankCheckRuns,
  rankSnapshots,
  rankTrackingConfigs,
  rankTrackingKeywords,
} from "@/db/schema";

/**
 * CALLER INVARIANT: every id list passed into this file must already be
 * bounded.
 *
 * Each read below sends its ids as bound parameters in ONE statement, and D1
 * caps bound parameters per statement — an unbounded list throws rather than
 * returning a short answer. Nothing here chunks, because nothing needs to: the
 * only caller is `getPortfolio`, which pages its project list at
 * `PORTFOLIO_PAGE_SIZE_MAX`, and every other list here is derived from that one
 * (at most one latest audit, one primary rank config and one latest run per
 * project on the page).
 *
 * That page size is therefore load-bearing for more than layout. A future
 * caller that reads every project at once has to chunk these itself or restore
 * the failure this comment exists to prevent.
 */
async function listGscConnections(
  organizationId: string,
  projectIds: string[],
) {
  if (projectIds.length === 0) return [];
  return db
    .select()
    .from(gscConnections)
    .where(
      and(
        eq(gscConnections.organizationId, organizationId),
        inArray(gscConnections.projectId, projectIds),
      ),
    );
}

async function listLatestCompletedAudits(projectIds: string[]) {
  if (projectIds.length === 0) return [];

  const latestByProject = db
    .select({
      projectId: audits.projectId,
      startedAt: max(audits.startedAt).as("startedAt"),
    })
    .from(audits)
    .where(
      and(
        inArray(audits.projectId, projectIds),
        eq(audits.status, "completed"),
      ),
    )
    .groupBy(audits.projectId)
    .as("latestPortfolioAudits");

  return db
    .select({
      id: audits.id,
      projectId: audits.projectId,
      startedAt: audits.startedAt,
      completedAt: audits.completedAt,
      pagesCrawled: audits.pagesCrawled,
    })
    .from(audits)
    .innerJoin(
      latestByProject,
      and(
        eq(audits.projectId, latestByProject.projectId),
        eq(audits.startedAt, latestByProject.startedAt),
      ),
    )
    .orderBy(desc(audits.startedAt));
}

async function listAuditPageSignals(auditIds: string[]) {
  if (auditIds.length === 0) return [];
  return db
    .select({
      auditId: auditPages.auditId,
      statusCode: auditPages.statusCode,
      title: auditPages.title,
      metaDescription: auditPages.metaDescription,
      h1Count: auditPages.h1Count,
      imagesMissingAlt: auditPages.imagesMissingAlt,
    })
    .from(auditPages)
    .where(inArray(auditPages.auditId, auditIds));
}

async function listAuditLighthouseSignals(auditIds: string[]) {
  if (auditIds.length === 0) return [];
  return db
    .select({
      auditId: auditLighthouseResults.auditId,
      seoScore: auditLighthouseResults.seoScore,
      errorMessage: auditLighthouseResults.errorMessage,
    })
    .from(auditLighthouseResults)
    .where(inArray(auditLighthouseResults.auditId, auditIds));
}

async function listPrimaryRankConfigCandidates(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: rankTrackingConfigs.id,
      projectId: rankTrackingConfigs.projectId,
      devices: rankTrackingConfigs.devices,
      createdAt: rankTrackingConfigs.createdAt,
      keywordCount: count(rankTrackingKeywords.id),
    })
    .from(rankTrackingConfigs)
    .leftJoin(
      rankTrackingKeywords,
      eq(rankTrackingKeywords.configId, rankTrackingConfigs.id),
    )
    .where(
      and(
        inArray(rankTrackingConfigs.projectId, projectIds),
        eq(rankTrackingConfigs.isActive, true),
      ),
    )
    .groupBy(
      rankTrackingConfigs.id,
      rankTrackingConfigs.projectId,
      rankTrackingConfigs.devices,
      rankTrackingConfigs.createdAt,
    )
    .orderBy(rankTrackingConfigs.createdAt);
}

async function listCompletedFullRankRuns(configIds: string[]) {
  if (configIds.length === 0) return [];
  return db
    .select({
      id: rankCheckRuns.id,
      configId: rankCheckRuns.configId,
      completedAt: rankCheckRuns.completedAt,
    })
    .from(rankCheckRuns)
    .where(
      and(
        inArray(rankCheckRuns.configId, configIds),
        eq(rankCheckRuns.status, "completed"),
        eq(rankCheckRuns.isSubsetRun, false),
      ),
    )
    .orderBy(desc(rankCheckRuns.completedAt));
}

async function listRankSnapshotPositions(runIds: string[]) {
  if (runIds.length === 0) return [];
  return db
    .select({
      runId: rankSnapshots.runId,
      device: rankSnapshots.device,
      position: rankSnapshots.position,
    })
    .from(rankSnapshots)
    .where(inArray(rankSnapshots.runId, runIds));
}

async function listLatestAnalysisActivity(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      projectId: analysisRuns.projectId,
      lastRanAt: max(analysisRuns.lastRanAt),
    })
    .from(analysisRuns)
    .where(inArray(analysisRuns.projectId, projectIds))
    .groupBy(analysisRuns.projectId);
}

export const PortfolioRepository = {
  listGscConnections,
  listLatestCompletedAudits,
  listAuditPageSignals,
  listAuditLighthouseSignals,
  listPrimaryRankConfigCandidates,
  listCompletedFullRankRuns,
  listRankSnapshotPositions,
  listLatestAnalysisActivity,
} as const;
