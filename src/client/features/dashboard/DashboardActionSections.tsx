import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppCard } from "@/client/components/AppCard";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";
import { getTechnicalAuditState } from "@/client/features/opportunities/technicalAuditState";
import {
  buildOpportunities,
  excludeWrongCustomer,
} from "@/client/features/opportunities/opportunityModel";
import {
  useProjectProfile,
  useKeywordFit,
} from "@/client/features/profiles/useProjectProfile";
import {
  auditHistoryKey,
  auditResultsKey,
} from "@/client/features/audit/auditQueryKeys";
import { selectInvestigationAudit } from "@/client/features/page-explorer/investigationAudit";
import { buildDashboardActions } from "./dashboardActions";
import { listOpportunities } from "@/serverFunctions/opportunities";
import {
  opportunityWorkKey,
  investigationSearch,
} from "@/client/features/opportunities/opportunityWorkShared";
import { Loader } from "@cloudflare/kumo/components/loader";

export function DashboardActions({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string | null;
}) {
  const report = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
  });
  const history = useQuery({
    queryKey: auditHistoryKey(projectId),
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });
  const latest = selectInvestigationAudit(
    history.data ?? [],
    domain ? `https://${domain.replace(/^https?:\/\//, "")}` : "",
  );
  const audit = useQuery({
    queryKey: auditResultsKey(projectId, latest?.id),
    queryFn: () =>
      getAuditResults({ data: { projectId, auditId: latest?.id ?? "" } }),
    enabled: Boolean(latest),
  });
  const technical = getTechnicalAuditState(
    history,
    audit,
    latest?.id,
    audit.data?.pages,
  );
  const ranked = useMemo(
    () =>
      report.data?.connected
        ? buildOpportunities({
            strikingDistance: report.data.strikingDistance,
            ctrOpportunities: report.data.ctrOpportunities,
            cannibalization: [],
          })
        : [],
    [report.data],
  );
  const { profile } = useProjectProfile(projectId);
  const queries = useMemo(() => ranked.map((row) => row.query), [ranked]);
  const fit = useKeywordFit(profile, queries);
  const relevant = useMemo(
    () => excludeWrongCustomer(ranked, fit),
    [ranked, fit],
  );
  const actions = buildDashboardActions(
    domain,
    audit.data?.pages ?? [],
    relevant.kept,
  ).slice(0, 3);
  return (
    <AppCard>
      <h2 className="text-lg font-medium">Next best actions</h2>
      <p className="text-xs text-base-content/60">
        Confirmed captured HTTP failures first, then relevant GSC investigations
        ordered by the existing scenario heuristic. Priority indicates where to
        investigate; it does not promise traffic.
      </p>
      {report.isError ? (
        <InlineQueryError
          message="Search Console priorities are unavailable."
          retrying={report.isFetching}
          onRetry={() => void report.refetch()}
        />
      ) : report.isPending ? (
        <p className="text-xs">Loading Search Console priorities…</p>
      ) : !report.data?.connected ? (
        <p className="text-xs">
          Search Console evidence unavailable.{" "}
          <Link
            to="/p/$projectId/search-performance"
            params={{ projectId }}
            className="app-link"
          >
            Review connection
          </Link>
        </p>
      ) : (
        <p className="text-xs">
          GSC window: {report.data.range.startDate}–{report.data.range.endDate}
          {report.data.sampling.queryPages.truncated
            ? " · partial query coverage"
            : ""}
        </p>
      )}
      {technical === "unavailable" ? (
        <InlineQueryError
          message="Stored technical evidence is unavailable."
          retrying={history.isFetching || audit.isFetching}
          onRetry={() =>
            void (history.isError ? history.refetch() : audit.refetch())
          }
        />
      ) : technical === "loading" ? (
        <p className="text-xs">Loading stored crawl evidence…</p>
      ) : technical === "not-run" ? (
        <p className="text-xs">
          No completed crawl for this website.{" "}
          <Link
            to="/p/$projectId/audit"
            params={{ projectId }}
            className="app-link"
          >
            Review Site Audit
          </Link>
        </p>
      ) : technical === "empty" ? (
        <p className="text-xs">
          Stored crawl has no page evidence; coverage is unknown.
        </p>
      ) : (
        <p className="text-xs">
          Crawl captured:{" "}
          {audit.data?.audit.completedAt ?? audit.data?.audit.startedAt}
        </p>
      )}
      {actions.length ? (
        <ol className="space-y-3">
          {actions.map((action) => (
            <li
              key={action.url}
              className="rounded-lg border border-base-300 p-3"
            >
              <Link
                to="/p/$projectId/page"
                params={{ projectId }}
                search={{
                  u: action.url,
                  startDate: report.data?.connected
                    ? report.data.range.startDate
                    : undefined,
                  endDate: report.data?.connected
                    ? report.data.range.endDate
                    : undefined,
                }}
                className="app-link font-medium"
              >
                {action.title}
              </Link>
              <p className="text-sm">{action.reason}</p>
              <p className="break-all text-xs text-base-content/60">
                {action.source} · {action.url}
              </p>
            </li>
          ))}
        </ol>
      ) : !report.isPending && technical !== "loading" ? (
        <p className="text-sm">
          No priorities matched these limited available checks. Missing sources
          and excluded profile matches can limit this list.
        </p>
      ) : null}
      <Link
        to="/p/$projectId/opportunities"
        params={{ projectId }}
        className="app-link"
      >
        Review all opportunities
      </Link>
    </AppCard>
  );
}

export function DashboardChanges({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string | null;
}) {
  const work = useQuery({
    queryKey: opportunityWorkKey(projectId, domain),
    queryFn: () => listOpportunities({ data: { projectId } }),
    enabled: Boolean(domain),
  });
  const declines =
    work.data?.opportunities.filter(
      (item) =>
        item.kind === "page_decline" && item.observationState === "observed",
    ) ?? [];
  return (
    <AppCard>
      <h2 className="text-lg font-medium">Changes to investigate</h2>
      <p className="text-xs text-base-content/60">
        Declining pages from matched final-data windows. Causes, seasonality and
        concurrent changes require review.
      </p>
      {work.isError ? (
        <InlineQueryError
          message="Recorded changes could not be loaded."
          retrying={work.isFetching}
          onRetry={() => void work.refetch()}
        />
      ) : domain && work.isPending ? (
        <Loader />
      ) : declines.length ? (
        <ul className="space-y-3">
          {declines.slice(0, 3).map((item) => (
            <li key={item.id}>
              <Link
                to="/p/$projectId/page"
                params={{ projectId }}
                search={investigationSearch(item)}
                className="app-link"
              >
                {item.title}
              </Link>
              <p className="text-xs">{item.finding}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">
          No recorded decline candidates for this website. Review the latest
          evidence in Saved work; absence of a task does not prove stable
          performance.
        </p>
      )}
      <Link
        to="/p/$projectId/opportunities"
        params={{ projectId }}
        className="app-link"
      >
        Review changes and evidence
      </Link>
    </AppCard>
  );
}
