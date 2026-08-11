import type { GscAccessFailureReason } from "@/shared/gsc";
import {
  auditHistoryKey,
  auditResultsKey,
} from "@/client/features/audit/auditQueryKeys";
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
import { useProjectProfile } from "@/client/features/profiles/useProjectProfile";
import type { ProjectProfile } from "@/shared/keyword-fit/profileTypes";
import type { ReportReadFailures } from "@/client/features/report/reportReads";
import { useReportPaidDetails } from "@/client/features/report/useReportPaidDetails";
import { useReportSnapshots } from "@/client/features/report/useReportSnapshots";

const STALE_TIME = 10 * 60_000;

/**
 * Every query the Client Report renders from, in one place so the page itself
 * stays about layout. Cached data is reused across tabs — the report costs
 * nothing extra to open when the rest of the project has already been viewed.
 */
/**
 * What the client sells, but only once they have confirmed it themselves.
 *
 * A standalone function rather than a ternary inside the hook: this report is
 * printed and handed to the client, so describing their own business back to
 * them from an AI draft nobody accepted is the worst place in the app to get
 * that wrong, and the rule deserves to be readable on its own.
 */
function confirmedOffer(profile: ProjectProfile): string | null {
  return profile.confirmedAt !== null ? profile.offer : null;
}

/**
 * Why Google search data is unavailable, not just that it is.
 *
 * The server distinguishes not_connected / requires_reconnect /
 * permission_denied / api_not_configured, and the report collapsed all four
 * into "not connected" -- so an expired OAuth grant on a live property printed,
 * in a PDF sent to the client, as though Search Console had never been set up.
 *
 * A pending read has no reason yet, which the caller renders as the generic
 * sentence rather than a specific accusation.
 */
function readGscFailureReason(
  report: { connected: boolean; reason?: GscAccessFailureReason } | undefined,
): GscAccessFailureReason | null {
  if (!report || report.connected) return null;
  return report.reason ?? null;
}

export function useClientReportData(projectId: string) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: STALE_TIME,
  });
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);
  const domain = project?.domain ?? null;
  // One free D1 read, and already cached by every tab hosting the profile
  // card. Degrades to the empty profile on failure, so the report loses a
  // sentence rather than a section.
  const { profile } = useProjectProfile(projectId);

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
    queryKey: auditHistoryKey(projectId),
    queryFn: () => getAuditHistory({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  const latestAudit = (auditsQuery.data ?? []).find(
    (audit) => audit.status === "completed",
  );
  const auditResultsQuery = useQuery({
    enabled: Boolean(latestAudit?.id),
    queryKey: auditResultsKey(projectId, latestAudit?.id),
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

  const snapshots = useReportSnapshots(projectId, domain);
  const paidDetails = useReportPaidDetails(projectId, domain);

  const content = contentQuery.data?.connected ? contentQuery.data : null;

  /**
   * Which reads threw, so a chapter can say so on the PRINTED sheet.
   *
   * Assembled here rather than at each call site because every consumer below
   * turns `undefined` into `[]` or `null` one line later, and from there a
   * failure is indistinguishable from an empty result. `isError` is the only
   * place the difference still exists.
   */
  const readFailures: ReportReadFailures = {
    projects: projectsQuery.isError,
    gsc: gscQuery.isError,
    topQueries: topQueriesQuery.isError,
    topPages: topPagesQuery.isError,
    content: contentQuery.isError,
    insights: insightsQuery.isError,
    audits: auditsQuery.isError,
    auditResults: auditResultsQuery.isError,
    onPage: onPageQuery.isError,
    brandVisibility: brandVisibilityQuery.isError,
    keywordDetails: paidDetails.keywordDetailsError != null,
    backlinkDetails: paidDetails.backlinkDetailsError != null,
  };

  return {
    project,
    domain,
    clientOffer: confirmedOffer(profile),
    readFailures,
    gsc: gscQuery.data?.connected ? gscQuery.data : null,
    gscFailureReason: readGscFailureReason(gscQuery.data),
    gscPending: gscQuery.isLoading,
    insights: insightsQuery.data?.connected ? insightsQuery.data : null,
    // Exposed so the report can tell "still loading" from "settled and
    // missing". Both leave the data null, but only the second justifies saying
    // the input was incomplete -- and this report gets printed.
    insightsPending: insightsQuery.isLoading,
    backlinks: snapshots.backlinks,
    domainOverview: snapshots.domainOverview,
    domainSnapshotMissing: snapshots.domainSnapshotMissing,
    backlinksSnapshotMissing: snapshots.backlinksSnapshotMissing,
    domainSnapshotGap: snapshots.domainSnapshotGap,
    backlinksSnapshotGap: snapshots.backlinksSnapshotGap,
    keywordDetailsMissing: paidDetails.keywordDetailsMissing,
    backlinkDetailsMissing: paidDetails.backlinkDetailsMissing,
    keywordDetailsLoading: paidDetails.keywordDetailsLoading,
    backlinkDetailsLoading: paidDetails.backlinkDetailsLoading,
    keywordDetailsError: paidDetails.keywordDetailsError,
    backlinkDetailsError: paidDetails.backlinkDetailsError,
    refreshKeywordDetails: paidDetails.refreshKeywordDetails,
    refreshBacklinkDetails: paidDetails.refreshBacklinkDetails,
    // A failed history read leaves this null exactly as "no audit has ever
    // completed" does; `readFailures.audits` is what stops the Site health
    // chapter printing the second sentence for the first cause.
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
    rankings: paidDetails.rankings,
    suggestions: paidDetails.suggestions,
    backlinkRows: paidDetails.backlinkRows,
    referringDomains: paidDetails.referringDomains,
  };
}
