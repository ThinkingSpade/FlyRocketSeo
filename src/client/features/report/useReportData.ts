import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";
import { getProjectEvents } from "@/serverFunctions/project-events";
import { getProjects } from "@/serverFunctions/projects";
import {
  getLatestRankResults,
  getRankConfigTrend,
  getRankTrackingConfigSummaries,
} from "@/serverFunctions/rank-tracking";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  computeAuditHealth,
  filterEventsToRange,
  REPORT_RANGES,
  reportDevice,
  type ReportRangeKey,
} from "./reportData";

/** Keep the printed report bounded: most projects track one domain; the rare
 * many-domain project gets its first few and a note would just be noise. */
const MAX_REPORT_CONFIGS = 4;

/**
 * Every data source behind the report, fetched with the app's existing server
 * functions — one query per section so a failing source degrades that section
 * only (same resilience pattern as the dashboard cards).
 */
export function useReportData(projectId: string, rangeKey: ReportRangeKey) {
  const range = REPORT_RANGES[rangeKey];

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });
  const project =
    projectsQuery.data?.find((candidate) => candidate.id === projectId) ?? null;

  const configsQuery = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });
  const configs = useMemo(
    () => (configsQuery.data ?? []).slice(0, MAX_REPORT_CONFIGS),
    [configsQuery.data],
  );

  const resultsQueries = useQueries({
    queries: configs.map((config) => ({
      queryKey: [
        "rankTrackingResults",
        projectId,
        config.id,
        range.comparePeriod,
      ],
      queryFn: () =>
        getLatestRankResults({
          data: {
            projectId,
            configId: config.id,
            comparePeriod: range.comparePeriod,
          },
        }),
    })),
  });

  const trendQueries = useQueries({
    queries: configs.map((config) => ({
      queryKey: [
        "rankConfigTrend",
        projectId,
        config.id,
        reportDevice(config.devices),
        range.sinceDays,
      ],
      queryFn: () =>
        getRankConfigTrend({
          data: {
            projectId,
            configId: config.id,
            device: reportDevice(config.devices),
            sinceDays: range.sinceDays,
          },
        }),
    })),
  });

  const eventsQuery = useQuery({
    queryKey: ["projectEvents", projectId],
    queryFn: () => getProjectEvents({ data: { projectId } }),
  });
  const eventsInRange = useMemo(
    () =>
      filterEventsToRange(eventsQuery.data ?? [], range.sinceDays, Date.now()),
    [eventsQuery.data, range.sinceDays],
  );

  const auditHistoryQuery = useQuery({
    queryKey: ["auditHistory", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });
  const latestCompletedAudit =
    auditHistoryQuery.data?.find((audit) => audit.status === "completed") ??
    null;
  const auditResultsQuery = useQuery({
    queryKey: ["auditResults", projectId, latestCompletedAudit?.id],
    enabled: latestCompletedAudit !== null,
    queryFn: () =>
      getAuditResults({
        data: { projectId, auditId: latestCompletedAudit!.id },
      }),
  });
  const auditHealth = useMemo(() => {
    if (!auditResultsQuery.data) return null;
    return computeAuditHealth(
      auditResultsQuery.data.pages,
      auditResultsQuery.data.lighthouse,
    );
  }, [auditResultsQuery.data]);

  // GSC self-reports `connected` and swallows expected failures, so one call
  // covers both the connection check and the totals.
  const gscQuery = useQuery({
    queryKey: ["reportSearchPerformance", projectId, range.gscRange],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: range.gscRange },
      }),
  });
  const gsc =
    gscQuery.data && gscQuery.data.connected
      ? {
          clicks: gscQuery.data.totals.clicks,
          impressions: gscQuery.data.totals.impressions,
          ctr: gscQuery.data.totals.ctr,
          position: gscQuery.data.totals.position,
          prevClicks: gscQuery.data.prevTotals.clicks,
          prevImpressions: gscQuery.data.prevTotals.impressions,
        }
      : null;

  return {
    range,
    project,
    projectPending: projectsQuery.isPending,
    configs,
    configsPending: configsQuery.isPending,
    configsError: configsQuery.isError,
    resultsQueries,
    trendQueries,
    allEvents: eventsQuery.data ?? [],
    eventsInRange,
    latestCompletedAudit,
    auditHealth,
    auditPending:
      auditHistoryQuery.isPending ||
      (latestCompletedAudit !== null && auditResultsQuery.isPending),
    gsc,
  };
}
