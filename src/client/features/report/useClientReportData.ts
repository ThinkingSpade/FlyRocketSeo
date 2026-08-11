import type { GscAccessFailureReason } from "@/shared/gsc";
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
import { getDomainKeywordsPage } from "@/serverFunctions/domain";
import { useProjectProfile } from "@/client/features/profiles/useProjectProfile";
import type { ProjectProfile } from "@/shared/keyword-fit/profileTypes";
import {
  getBacklinksReferringDomains,
  getBacklinksRows,
} from "@/serverFunctions/backlinks";
import {
  BACKLINKS_DEFAULT_SORT,
  DEFAULT_BACKLINKS_PAGE_SIZE,
} from "@/types/schemas/backlinks";
import {
  DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
  normalizeDomain,
} from "@/types/schemas/domain";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { DEFAULT_LOCATION_CODE } from "@/shared/keyword-locations";
import { getLanguageCode } from "@/client/features/keywords/utils";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const STALE_TIME = 10 * 60_000;

function toComparableDomain(value: string): string | null {
  try {
    return normalizeDomain(value.replace(/^\*\./, ""));
  } catch {
    return null;
  }
}

function reportSnapshotMatchesDomain(
  snapshotTarget: string,
  projectDomain: string,
): boolean {
  const snapshotDomain = toComparableDomain(snapshotTarget);
  const normalizedProjectDomain = toComparableDomain(projectDomain);
  return (
    snapshotDomain != null &&
    normalizedProjectDomain != null &&
    snapshotDomain === normalizedProjectDomain
  );
}

function useReportPaidDetails(projectId: string, domain: string | null) {
  const hasDomain = Boolean(domain);
  const keywordDetailsRun = useAuthorizedRun(
    createMeteredRunKey(
      projectId,
      domain,
      true,
      DEFAULT_LOCATION_CODE,
      getLanguageCode(DEFAULT_LOCATION_CODE),
      1,
      DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
      "traffic",
      "desc",
      {},
    ),
  );
  const keywordDetailsQuery = useMeteredQuery({
    authorized: keywordDetailsRun.authorized,
    runNonce: keywordDetailsRun.runNonce,
    enabled: hasDomain,
    queryKey: ["report-domain-keywords", projectId, domain],
    queryFn: () =>
      getDomainKeywordsPage({
        data: {
          projectId,
          domain: domain ?? "",
          includeSubdomains: true,
          locationCode: DEFAULT_LOCATION_CODE,
          languageCode: getLanguageCode(DEFAULT_LOCATION_CODE),
          page: 1,
          pageSize: DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
          sortMode: "traffic",
          sortOrder: "desc",
          filters: {},
        },
      }),
  });

  const backlinkDetailsRun = useAuthorizedRun(
    createMeteredRunKey(
      projectId,
      domain,
      "domain",
      1,
      DEFAULT_BACKLINKS_PAGE_SIZE,
      BACKLINKS_DEFAULT_SORT.backlinks,
      BACKLINKS_DEFAULT_SORT.domains,
    ),
  );
  const backlinkRowsQuery = useMeteredQuery({
    authorized: backlinkDetailsRun.authorized,
    runNonce: backlinkDetailsRun.runNonce,
    enabled: hasDomain,
    queryKey: ["report-backlink-rows", projectId, domain],
    queryFn: () =>
      getBacklinksRows({
        data: {
          projectId,
          target: domain ?? "",
          scope: "domain",
          page: 1,
          pageSize: DEFAULT_BACKLINKS_PAGE_SIZE,
          sortField: BACKLINKS_DEFAULT_SORT.backlinks.field,
          sortOrder: BACKLINKS_DEFAULT_SORT.backlinks.order,
          filters: {},
          mode: "one_per_domain",
        },
      }),
  });
  const referringDomainsQuery = useMeteredQuery({
    authorized: backlinkDetailsRun.authorized,
    runNonce: backlinkDetailsRun.runNonce,
    enabled: hasDomain,
    queryKey: ["report-referring-domains", projectId, domain],
    queryFn: () =>
      getBacklinksReferringDomains({
        data: {
          projectId,
          target: domain ?? "",
          scope: "domain",
          page: 1,
          pageSize: DEFAULT_BACKLINKS_PAGE_SIZE,
          sortField: BACKLINKS_DEFAULT_SORT.domains.field,
          sortOrder: BACKLINKS_DEFAULT_SORT.domains.order,
          filters: {},
        },
      }),
  });

  return {
    keywordDetailsMissing: hasDomain && keywordDetailsQuery.data == null,
    backlinkDetailsMissing:
      hasDomain &&
      (backlinkRowsQuery.data == null || referringDomainsQuery.data == null),
    keywordDetailsLoading: keywordDetailsQuery.isFetching,
    backlinkDetailsLoading:
      backlinkRowsQuery.isFetching || referringDomainsQuery.isFetching,
    keywordDetailsError: keywordDetailsQuery.isError
      ? getStandardErrorMessage(
          keywordDetailsQuery.error,
          "Could not load keyword details.",
        )
      : null,
    backlinkDetailsError:
      backlinkRowsQuery.isError || referringDomainsQuery.isError
        ? getStandardErrorMessage(
            backlinkRowsQuery.error ?? referringDomainsQuery.error,
            "Could not load backlink details.",
          )
        : null,
    refreshKeywordDetails: keywordDetailsRun.authorize,
    refreshBacklinkDetails: backlinkDetailsRun.authorize,
    rankings: (keywordDetailsQuery.data?.keywords ?? []).slice(0, 10),
    suggestions: (keywordDetailsQuery.data?.keywords ?? [])
      .filter((row) => row.position == null || row.position > 10)
      .slice(0, 10)
      .map((row) => ({
        keyword: row.keyword,
        searchVolume: row.searchVolume,
        keywordDifficulty: row.keywordDifficulty,
        cpc: row.cpc,
      })),
    backlinkRows: (backlinkRowsQuery.data?.rows ?? []).slice(0, 10),
    referringDomains: (referringDomainsQuery.data?.rows ?? []).slice(0, 10),
  };
}

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
  const hasDomain = Boolean(domain);
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
  const matchingDomainRun =
    domainRun &&
    domain &&
    reportSnapshotMatchesDomain(domainRun.result.domain, domain)
      ? domainRun
      : null;
  const matchingBacklinksRun =
    backlinksRun &&
    domain &&
    backlinksRun.result.overview.scope === "domain" &&
    reportSnapshotMatchesDomain(backlinksRun.result.overview.target, domain)
      ? backlinksRun
      : null;
  const paidDetails = useReportPaidDetails(projectId, domain);

  const content = contentQuery.data?.connected ? contentQuery.data : null;

  return {
    project,
    domain,
    clientOffer: confirmedOffer(profile),
    gsc: gscQuery.data?.connected ? gscQuery.data : null,
    gscFailureReason: readGscFailureReason(gscQuery.data),
    gscPending: gscQuery.isLoading,
    insights: insightsQuery.data?.connected ? insightsQuery.data : null,
    // Exposed so the report can tell "still loading" from "settled and
    // missing". Both leave the data null, but only the second justifies saying
    // the input was incomplete -- and this report gets printed.
    insightsPending: insightsQuery.isLoading,
    backlinks: matchingBacklinksRun?.result.overview ?? null,
    domainOverview: matchingDomainRun?.result ?? null,
    domainSnapshotMissing: hasDomain && matchingDomainRun == null,
    backlinksSnapshotMissing: hasDomain && matchingBacklinksRun == null,
    keywordDetailsMissing: paidDetails.keywordDetailsMissing,
    backlinkDetailsMissing: paidDetails.backlinkDetailsMissing,
    keywordDetailsLoading: paidDetails.keywordDetailsLoading,
    backlinkDetailsLoading: paidDetails.backlinkDetailsLoading,
    keywordDetailsError: paidDetails.keywordDetailsError,
    backlinkDetailsError: paidDetails.backlinkDetailsError,
    refreshKeywordDetails: paidDetails.refreshKeywordDetails,
    refreshBacklinkDetails: paidDetails.refreshBacklinkDetails,
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
