import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useProject } from "@/client/hooks/useProjectDomain";
import { getGscConnection } from "@/serverFunctions/gsc";
import { getCachedBusinessContext } from "@/serverFunctions/local-seo";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  domainStem,
  getBrandedQueries,
  getLocalLandingPages,
  isProjectGscReport,
} from "@/client/features/search-performance/projectGscInsights";

function projectBusinessName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed && trimmed.toLowerCase() !== "default" ? trimmed : null;
}

export function useLocalSeoProjectContext({
  projectId,
  initialQuery,
  onPrefill,
}: {
  projectId: string;
  initialQuery: string;
  onPrefill: (value: string) => void;
}) {
  const project = useProject(projectId);
  const cachedBusinessQuery = useQuery({
    queryKey: ["cached-business-context", projectId],
    queryFn: () => getCachedBusinessContext({ data: { projectId } }),
    staleTime: 5 * 60_000,
  });
  const gscConnectionQuery = useQuery({
    queryKey: ["gscConnection", projectId],
    queryFn: () => getGscConnection({ data: { projectId } }),
    staleTime: 5 * 60_000,
  });
  const gscReportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    staleTime: 5 * 60_000,
  });
  const projectDomain = project?.domain?.trim() || null;
  const projectName = projectBusinessName(project?.name);
  const cachedBusiness = cachedBusinessQuery.data;
  const gscDomain = domainStem(gscConnectionQuery.data?.siteUrl);
  const businessGuess =
    cachedBusiness?.profile.title?.trim() ||
    projectName ||
    gscDomain ||
    domainStem(projectDomain) ||
    "";
  const guessSource = cachedBusiness?.profile.title?.trim()
    ? "your cached Google Business Profile"
    : projectName
      ? "the project identity"
      : gscConnectionQuery.data?.siteUrl
        ? "the connected Search Console property"
        : projectDomain
          ? "the project domain"
          : null;
  const hasPrefilledBusiness = useRef(Boolean(initialQuery.trim()));
  useEffect(() => {
    if (hasPrefilledBusiness.current || !businessGuess) return;
    hasPrefilledBusiness.current = true;
    onPrefill(businessGuess);
  }, [businessGuess, onPrefill]);
  const gscData = gscReportQuery.data;

  return {
    projectDomain,
    projectName,
    cachedBusiness,
    gscDomain,
    businessGuess,
    guessSource,
    report: isProjectGscReport(gscData) ? gscData : null,
    isReportLoading: gscReportQuery.isPending,
    isGscConnected: gscData?.connected !== false,
  };
}

type LocalSeoProjectContext = ReturnType<typeof useLocalSeoProjectContext>;

export function LocalGscContext({
  projectId,
  context,
}: {
  projectId: string;
  context: LocalSeoProjectContext;
}) {
  const brandedQueries = context.report
    ? getBrandedQueries(context.report, [
        context.cachedBusiness?.profile.title,
        context.projectName,
        context.gscDomain,
        domainStem(context.projectDomain),
      ])
    : [];
  const localPages = context.report
    ? getLocalLandingPages(context.report, [
        context.cachedBusiness?.profile.city,
        context.cachedBusiness?.profile.region,
      ])
    : [];
  // Both lists are filtered out of a capped Search Console pull, so an empty
  // list means "none among the rows we read", not "none exist".
  const sampled =
    (context.report?.sampling.queryTotals.truncated ?? false) ||
    (context.report?.sampling.queryPages.truncated ?? false);
  return (
    <aside className="border-t border-base-300 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Your local search context</h2>
        <span className="text-xs text-base-content/45">Free GSC</span>
      </div>
      {context.isReportLoading ? (
        <div className="mt-2 space-y-2">
          <div className="skeleton h-4 w-4/5" />
          <div className="skeleton h-4 w-3/5" />
        </div>
      ) : !context.report ? (
        <p className="mt-2 text-xs text-base-content/55">
          {context.isGscConnected
            ? "Search Console context is temporarily unavailable."
            : "Connect Search Console to see branded searches and local landing pages before running a lookup."}{" "}
          <Link
            to="/p/$projectId/search-performance"
            params={{ projectId }}
            className="link link-hover"
          >
            Open GSC Insights
          </Link>
        </p>
      ) : brandedQueries.length === 0 && localPages.length === 0 ? (
        <p className="mt-2 text-xs text-base-content/55">
          {sampled
            ? "No clearly branded or local-intent results among the rows Search Console returned for the last 28 days."
            : "No clearly branded or local-intent results appeared in the last 28 days yet."}
        </p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <ContextList
            title="Branded queries"
            items={brandedQueries.map((row) => ({
              label: row.query,
              metric: `${Math.round(row.impressions).toLocaleString()} impr.`,
            }))}
            empty={
              sampled
                ? "None among the returned queries."
                : "No branded queries found."
            }
          />
          <ContextList
            title="Local landing pages"
            items={localPages.map((row) => ({
              label: pageLabel(row.page),
              metric: `${Math.round(row.impressions).toLocaleString()} impr.`,
            }))}
            empty={
              sampled
                ? "None among the returned pages."
                : "No local landing pages found."
            }
          />
        </div>
      )}
    </aside>
  );
}

function pageLabel(page: string): string {
  try {
    const url = new URL(page);
    return url.pathname === "/" ? url.hostname : url.pathname;
  } catch {
    return page;
  }
}

function ContextList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ label: string; metric: string }>;
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium text-base-content/60">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-base-content/45">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.slice(0, 3).map((item) => (
            <li
              key={item.label}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className="min-w-0 truncate" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 text-base-content/45 tabular-nums">
                {item.metric}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
