import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import {
  getContentPerformance,
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";
import { getLinkInsights } from "@/serverFunctions/link-insights";
import {
  getDomainKeywordSuggestions,
  getDomainKeywordsPage,
  getDomainOverview,
} from "@/serverFunctions/domain";
import {
  getBacklinksOverview,
  getBacklinksReferringDomains,
  getBacklinksRows,
} from "@/serverFunctions/backlinks";
import { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";

const STALE_TIME = 10 * 60_000;

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

  const domainQuery = useQuery({
    enabled: hasDomain,
    queryKey: ["report-domain", projectId, domain],
    queryFn: () =>
      getDomainOverview({ data: { projectId, domain: domain ?? "" } }),
    staleTime: STALE_TIME,
  });
  const backlinksQuery = useQuery({
    enabled: hasDomain,
    queryKey: ["report-backlinks", projectId, domain],
    queryFn: () =>
      getBacklinksOverview({ data: { projectId, target: domain ?? "" } }),
    staleTime: STALE_TIME,
  });
  const rankingsQuery = useQuery({
    enabled: hasDomain,
    queryKey: ["report-rankings", projectId, domain],
    queryFn: () =>
      getDomainKeywordsPage({ data: { projectId, domain: domain ?? "" } }),
    staleTime: STALE_TIME,
  });
  const suggestionsQuery = useQuery({
    enabled: hasDomain,
    queryKey: ["report-suggestions", projectId, domain],
    queryFn: () =>
      getDomainKeywordSuggestions({
        data: {
          projectId,
          domain: domain ?? "",
          locationCode: 2840,
          languageCode: "en",
        },
      }),
    staleTime: STALE_TIME,
  });
  const backlinkRowsQuery = useQuery({
    enabled: hasDomain,
    queryKey: ["report-backlink-rows", projectId, domain],
    queryFn: () =>
      getBacklinksRows({ data: { projectId, target: domain ?? "" } }),
    staleTime: STALE_TIME,
  });
  const referringDomainsQuery = useQuery({
    enabled: hasDomain,
    queryKey: ["report-ref-domains", projectId, domain],
    queryFn: () =>
      getBacklinksReferringDomains({
        data: { projectId, target: domain ?? "" },
      }),
    staleTime: STALE_TIME,
  });

  const content = contentQuery.data?.connected ? contentQuery.data : null;

  return {
    project,
    domain,
    gsc: gscQuery.data?.connected ? gscQuery.data : null,
    gscPending: gscQuery.isLoading,
    insights: insightsQuery.data?.connected ? insightsQuery.data : null,
    backlinks: backlinksQuery.data ?? null,
    domainOverview: domainQuery.data ?? null,
    latestAudit: latestAudit ?? null,
    auditPages: auditResultsQuery.data?.pages ?? [],
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
    rankings: (rankingsQuery.data?.keywords ?? []).slice(0, 10),
    suggestions: (suggestionsQuery.data ?? []).slice(0, 12),
    backlinkRows: (backlinkRowsQuery.data?.rows ?? []).slice(0, 10),
    referringDomains: (referringDomainsQuery.data?.rows ?? []).slice(0, 10),
  };
}
