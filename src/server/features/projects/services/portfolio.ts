import { createGscClient } from "@/server/lib/gscClient";
import {
  buildSearchAnalyticsRequest,
  resolveDateRange,
} from "@/server/features/gsc/searchAnalytics";
import {
  previousPeriod,
  sumSearchTotals,
} from "@/server/features/gsc/searchPerformanceReport";
import { PortfolioRepository } from "@/server/features/projects/repositories/PortfolioRepository";
import { listProjectsEnsuringOne } from "@/server/features/projects/services/projects";

const GSC_DAILY_ROW_LIMIT = 200;
const GSC_PROJECT_CONCURRENCY = 4;

type GscConnectionRow = Awaited<
  ReturnType<typeof PortfolioRepository.listGscConnections>
>[number];
type LatestAuditRow = Awaited<
  ReturnType<typeof PortfolioRepository.listLatestCompletedAudits>
>[number];
type RankConfigCandidate = Awaited<
  ReturnType<typeof PortfolioRepository.listPrimaryRankConfigCandidates>
>[number];

function groupBy<TKey, TValue>(
  values: TValue[],
  getKey: (value: TValue) => TKey,
): Map<TKey, TValue[]> {
  const grouped = new Map<TKey, TValue[]>();
  for (const value of values) {
    const key = getKey(value);
    const existing = grouped.get(key);
    if (existing) existing.push(value);
    else grouped.set(key, [value]);
  }
  return grouped;
}

function hasText(value: string | null): boolean {
  return Boolean(value?.trim());
}

function summarizeAudit(
  audit: LatestAuditRow,
  pageRows: Awaited<
    ReturnType<typeof PortfolioRepository.listAuditPageSignals>
  >,
  lighthouseRows: Awaited<
    ReturnType<typeof PortfolioRepository.listAuditLighthouseSignals>
  >,
) {
  let issueCount = 0;
  for (const page of pageRows) {
    if (page.statusCode == null || page.statusCode >= 400) issueCount += 1;
    if (!hasText(page.title)) issueCount += 1;
    if (!hasText(page.metaDescription)) issueCount += 1;
    if (page.h1Count !== 1) issueCount += 1;
    issueCount += page.imagesMissingAlt;
  }

  let seoScoreTotal = 0;
  let seoScoreCount = 0;
  for (const lighthouse of lighthouseRows) {
    if (lighthouse.errorMessage || lighthouse.seoScore == null) {
      issueCount += 1;
      continue;
    }
    seoScoreTotal += lighthouse.seoScore;
    seoScoreCount += 1;
    if (lighthouse.seoScore < 90) issueCount += 1;
  }

  return {
    score: seoScoreCount > 0 ? Math.round(seoScoreTotal / seoScoreCount) : null,
    issueCount,
    checkedAt: audit.completedAt ?? audit.startedAt,
    pagesCrawled: audit.pagesCrawled,
  };
}

function selectPrimaryRankConfigs(
  candidates: RankConfigCandidate[],
): Map<string, RankConfigCandidate> {
  const primaryByProject = new Map<string, RankConfigCandidate>();
  for (const candidate of candidates) {
    const current = primaryByProject.get(candidate.projectId);
    if (!current || candidate.keywordCount > current.keywordCount) {
      primaryByProject.set(candidate.projectId, candidate);
    }
  }
  return primaryByProject;
}

async function loadGscTotals(
  connection: GscConnectionRow,
  range: {
    startDate: string;
    endDate: string;
    prevStartDate: string;
    prevEndDate: string;
  },
) {
  const client = createGscClient({ userId: connection.connectedByUserId });
  const currentRequest = buildSearchAnalyticsRequest({
    projectId: connection.projectId,
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ["date"],
    rowLimit: GSC_DAILY_ROW_LIMIT,
  });
  const previousRequest = buildSearchAnalyticsRequest({
    projectId: connection.projectId,
    startDate: range.prevStartDate,
    endDate: range.prevEndDate,
    dimensions: ["date"],
    rowLimit: GSC_DAILY_ROW_LIMIT,
  });

  try {
    const [current, previous] = await Promise.all([
      client.querySearchAnalytics(connection.siteUrl, currentRequest),
      client.querySearchAnalytics(connection.siteUrl, previousRequest),
    ]);
    return {
      status: "connected" as const,
      current: sumSearchTotals(current.rows),
      previous: sumSearchTotals(previous.rows),
    };
  } catch (error) {
    console.warn("[portfolio] Search Console summary unavailable", {
      projectId: connection.projectId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return { status: "unavailable" as const };
  }
}

async function loadGscPortfolio(
  connections: GscConnectionRow[],
  range: {
    startDate: string;
    endDate: string;
    prevStartDate: string;
    prevEndDate: string;
  },
) {
  const output: Array<{
    projectId: string;
    data: Awaited<ReturnType<typeof loadGscTotals>>;
  }> = [];

  // GSC has no cross-property batch endpoint. Keep the unavoidable free API
  // fan-out bounded so a large portfolio does not saturate one Worker request.
  for (
    let offset = 0;
    offset < connections.length;
    offset += GSC_PROJECT_CONCURRENCY
  ) {
    const batch = connections.slice(offset, offset + GSC_PROJECT_CONCURRENCY);
    output.push(
      ...(await Promise.all(
        batch.map(async (connection) => ({
          projectId: connection.projectId,
          data: await loadGscTotals(connection, range),
        })),
      )),
    );
  }
  return output;
}

export async function getPortfolio(organizationId: string) {
  const projects = await listProjectsEnsuringOne(organizationId);
  const projectIds = projects.map((project) => project.id);
  const currentRange = resolveDateRange({ dateRange: "last_28_days" });
  const previousRange = previousPeriod(
    currentRange.startDate,
    currentRange.endDate,
  );
  const range = {
    ...currentRange,
    prevStartDate: previousRange.startDate,
    prevEndDate: previousRange.endDate,
  };

  const [connections, latestAudits, rankCandidates, activityRows] =
    await Promise.all([
      PortfolioRepository.listGscConnections(organizationId, projectIds),
      PortfolioRepository.listLatestCompletedAudits(projectIds),
      PortfolioRepository.listPrimaryRankConfigCandidates(projectIds),
      PortfolioRepository.listLatestAnalysisActivity(projectIds),
    ]);

  const primaryRankConfigs = selectPrimaryRankConfigs(rankCandidates);
  const primaryConfigIds = [...primaryRankConfigs.values()].map(
    (config) => config.id,
  );
  const auditIds = latestAudits.map((audit) => audit.id);

  const [pageSignals, lighthouseSignals, completedRankRuns, gscResults] =
    await Promise.all([
      PortfolioRepository.listAuditPageSignals(auditIds),
      PortfolioRepository.listAuditLighthouseSignals(auditIds),
      PortfolioRepository.listCompletedFullRankRuns(primaryConfigIds),
      loadGscPortfolio(connections, range),
    ]);

  const latestRunByConfig = new Map<
    string,
    (typeof completedRankRuns)[number]
  >();
  for (const run of completedRankRuns) {
    if (!latestRunByConfig.has(run.configId)) {
      latestRunByConfig.set(run.configId, run);
    }
  }
  const latestRunIds = [...latestRunByConfig.values()].map((run) => run.id);
  const snapshotPositions =
    await PortfolioRepository.listRankSnapshotPositions(latestRunIds);

  const auditByProject = new Map<string, LatestAuditRow>();
  for (const audit of latestAudits) {
    if (!auditByProject.has(audit.projectId)) {
      auditByProject.set(audit.projectId, audit);
    }
  }
  const pagesByAudit = groupBy(pageSignals, (row) => row.auditId);
  const lighthouseByAudit = groupBy(lighthouseSignals, (row) => row.auditId);
  const snapshotsByRun = groupBy(
    snapshotPositions,
    (snapshot) => snapshot.runId,
  );
  const connectionProjectIds = new Set(
    connections.map((connection) => connection.projectId),
  );
  const gscByProject = new Map(
    gscResults.map((result) => [result.projectId, result.data]),
  );
  const activityByProject = new Map(
    activityRows.map((row) => [row.projectId, row.lastRanAt]),
  );

  const rows = projects.map((project) => {
    const audit = auditByProject.get(project.id);
    const primaryConfig = primaryRankConfigs.get(project.id);
    const rankRun = primaryConfig
      ? latestRunByConfig.get(primaryConfig.id)
      : undefined;
    const preferredDevice =
      primaryConfig?.devices === "mobile" ? "mobile" : "desktop";
    const rankPositions = rankRun
      ? (snapshotsByRun.get(rankRun.id) ?? []).reduce<number[]>(
          (positions, snapshot) => {
            if (
              snapshot.device === preferredDevice &&
              snapshot.position != null
            ) {
              positions.push(snapshot.position);
            }
            return positions;
          },
          [],
        )
      : [];

    return {
      ...project,
      gsc:
        gscByProject.get(project.id) ??
        (connectionProjectIds.has(project.id)
          ? { status: "unavailable" as const }
          : { status: "not_connected" as const }),
      audit: audit
        ? summarizeAudit(
            audit,
            pagesByAudit.get(audit.id) ?? [],
            lighthouseByAudit.get(audit.id) ?? [],
          )
        : null,
      rankTracking:
        primaryConfig && rankRun
          ? {
              averagePosition:
                rankPositions.length > 0
                  ? rankPositions.reduce((sum, value) => sum + value, 0) /
                    rankPositions.length
                  : null,
              checkedAt: rankRun.completedAt,
              keywordCount: primaryConfig.keywordCount,
              device: preferredDevice,
            }
          : null,
      lastActivityAt: activityByProject.get(project.id) ?? null,
    };
  });

  return { range, projects: rows };
}
