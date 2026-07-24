import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import {
  getContentPerformance,
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";
import { getLinkInsights } from "@/serverFunctions/link-insights";
import { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";
import { getOnPageFixes } from "@/serverFunctions/onPage";
import { getBrandVisibilityHistory } from "@/serverFunctions/brandVisibility";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { domainOverviewResultSchema } from "@/types/schemas/domain";
import { backlinksOverviewCacheSchema } from "@/types/schemas/backlinks-results";

const STALE_TIME = 10 * 60_000;
type ReportRanking = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  traffic: number | null;
  keywordDifficulty: number | null;
  relativeUrl: string | null;
};
type ReportSuggestion = {
  keyword: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
};
type ReportBacklink = {
  domainFrom: string | null;
  urlFrom: string | null;
  urlTo: string | null;
  anchor: string | null;
  isDofollow: boolean | null;
  rank: number | null;
};
type ReportReferringDomain = {
  domain: string | null;
  backlinks: number | null;
  rank: number | null;
};

/**
 * Every query the Client Report renders from, in one place so the page itself
 * stays about layout. Cached data is reused across tabs — the report costs
 * nothing extra to open when the rest of the project has already been viewed.
 */
export function useClientReportData(projectId: string) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: STALE_TIME,
  });
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);
  const domain = project?.domain ?? null;
  const hasDomain = Boolean(domain);

  const gscQuery = useQuery({
    queryKey: ["report-gsc", projectId],
    queryFn: () => getSearchPerformanceReport({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  const topQueriesQuery = useQuery({
    queryKey: ["report-top-queries", projectId],
    queryFn: () =>
      getSearchPerformanceTable({
        data: { projectId, dimension: "query", page: 1, pageSize: 25 },
      }),
    staleTime: STALE_TIME,
  });
  const topPagesQuery = useQuery({
    queryKey: ["report-top-pages", projectId],
    queryFn: () =>
      getSearchPerformanceTable({
        data: { projectId, dimension: "page", page: 1, pageSize: 25 },
      }),
    staleTime: STALE_TIME,
  });
  // Shares the Content tab's key so opening both costs one fetch, not two.
  const contentQuery = useQuery({
    queryKey: [
      "contentPerformance",
      projectId,
      "last_28_days",
      undefined,
      undefined,
    ],
    queryFn: () =>
      getContentPerformance({ data: { projectId, dateRange: "last_28_days" } }),
    staleTime: STALE_TIME,
  });
  const insightsQuery = useQuery({
    queryKey: ["link-insights", projectId],
    queryFn: () => getLinkInsights({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  const auditsQuery = useQuery({
    queryKey: ["report-audits", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  const latestAudit = (auditsQuery.data ?? []).find(
    (audit) => audit.status === "completed",
  );
  const auditResultsQuery = useQuery({
    enabled: Boolean(latestAudit?.id),
    queryKey: ["report-audit-results", projectId, latestAudit?.id],
    queryFn: () =>
      getAuditResults({ data: { projectId, auditId: latestAudit?.id ?? "" } }),
    staleTime: STALE_TIME,
  });
  // Shares the On-Page Fixes tab's cache key, so the report reuses it.
  const onPageQuery = useQuery({
    queryKey: ["onPageFixes", projectId],
    queryFn: () => getOnPageFixes({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  // Shares the Brand Lookup tab's cache key; reads the latest stored AI
  // visibility snapshot — no API spend.
  const brandVisibilityQuery = useQuery({
    queryKey: ["brandVisibility", projectId],
    queryFn: () => getBrandVisibilityHistory({ data: { projectId } }),
    staleTime: STALE_TIME,
  });

  const { restored: domainRun } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.domainOverview,
    schema: domainOverviewResultSchema,
    enabled: hasDomain,
  });
  const { restored: backlinksRun } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.backlinks,
    schema: backlinksOverviewCacheSchema,
    enabled: hasDomain,
  });

  const content = contentQuery.data?.connected ? contentQuery.data : null;

  return {
    project,
    domain,
    gsc: gscQuery.data?.connected ? gscQuery.data : null,
    gscPending: gscQuery.isLoading,
    insights: insightsQuery.data?.connected ? insightsQuery.data : null,
    backlinks: backlinksRun?.result.overview ?? null,
    domainOverview: domainRun?.result ?? null,
    domainSnapshotMissing: hasDomain && domainRun == null,
    backlinksSnapshotMissing: hasDomain && backlinksRun == null,
    keywordDetailsMissing: hasDomain,
    backlinkDetailsMissing: hasDomain,
    latestAudit: latestAudit ?? null,
    auditPages: auditResultsQuery.data?.pages ?? [],
    approvedFixes: (onPageQuery.data?.rows ?? []).filter(
      (row) => row.status === "approved",
    ),
    brandVisibility: brandVisibilityQuery.data ?? null,
    currentPages: content?.current ?? [],
    previousPages: content?.previous ?? [],
    topQueries: (topQueriesQuery.data?.connected
      ? topQueriesQuery.data.rows
      : []
    ).slice(0, 10),
    topPages: (topPagesQuery.data?.connected
      ? topPagesQuery.data.rows
      : []
    ).slice(0, 10),
    rankings: [] as ReportRanking[],
    suggestions: [] as ReportSuggestion[],
    backlinkRows: [] as ReportBacklink[],
    referringDomains: [] as ReportReferringDomain[],
  };
}
