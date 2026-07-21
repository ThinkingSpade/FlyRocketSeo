import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ClipboardCheck,
  Lightbulb,
  PenLine,
  Split,
  Wrench,
} from "lucide-react";
import { InsightIcon, InsightTile } from "@/client/components/InsightTile";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";
import { scoreCannibalization } from "@/client/features/link-insights/cannibalizationSeverity";
import { useLinkInsights } from "@/client/features/link-insights/useLinkInsights";
import { toPath } from "@/client/features/link-insights/useLinkInsights";
import {
  buildOpportunities,
  buildTechnicalIssues,
  type Opportunity,
  type OpportunityKind,
} from "./opportunityModel";

const KIND_META: Record<
  OpportunityKind,
  { label: string; icon: typeof PenLine; className: string }
> = {
  "quick-win": {
    label: "Quick win",
    icon: ArrowUpRight,
    className: "badge-success",
  },
  ctr: { label: "Rewrite title", icon: PenLine, className: "badge-warning" },
  consolidate: { label: "Consolidate", icon: Split, className: "badge-error" },
};

const SEVERITY_CLASS = {
  high: "badge-error",
  medium: "badge-warning",
  low: "badge-ghost",
} as const;

const OPPORTUNITY_LIMIT = 25;

export function OpportunitiesPage({ projectId }: { projectId: string }) {
  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
  });
  const linkInsightsQuery = useLinkInsights(projectId);

  // Technical issues come from the most recent completed audit's stored
  // pages — nothing is re-crawled to show them.
  const historyQuery = useQuery({
    queryKey: ["auditHistory", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });
  const latestAuditId = historyQuery.data?.find(
    (audit) => audit.status === "completed",
  )?.id;
  const auditQuery = useQuery({
    enabled: latestAuditId != null,
    queryKey: ["auditResults", projectId, latestAuditId],
    queryFn: () =>
      getAuditResults({ data: { projectId, auditId: latestAuditId ?? "" } }),
  });

  const report = reportQuery.data;
  const linkInsights = linkInsightsQuery.data;

  const opportunities = useMemo(() => {
    if (!report?.connected) return [];
    const cannibalization = linkInsights?.connected
      ? scoreCannibalization(linkInsights.cannibalization).filter(
          (row) => row.severity !== "low",
        )
      : [];
    return buildOpportunities({
      strikingDistance: report.strikingDistance,
      ctrOpportunities: report.ctrOpportunities,
      cannibalization,
    });
  }, [report, linkInsights]);

  const technicalIssues = useMemo(
    () => buildTechnicalIssues(auditQuery.data?.pages ?? []),
    [auditQuery.data],
  );

  const totalClicksAtStake = opportunities.reduce(
    (sum, item) => sum + item.clicksAtStake,
    0,
  );
  const affectedPages = technicalIssues.reduce(
    (sum, issue) => sum + issue.pageCount,
    0,
  );

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Lightbulb className="size-5" />
          SEO Opportunities
        </h1>
        <p className="text-sm text-base-content/60">
          What to fix next, ranked by the traffic at stake — built from your
          Search Console data and your latest site audit. Nothing here costs a
          credit.
        </p>
      </div>

      {reportQuery.isError ? (
        <div className="alert alert-error text-sm">
          {getStandardErrorMessage(reportQuery.error)}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InsightTile
          icon={Lightbulb}
          label="Opportunities"
          value={opportunities.length}
          tone="primary"
        />
        <InsightTile
          icon={ArrowUpRight}
          label="Clicks at stake"
          value={totalClicksAtStake.toLocaleString()}
          hint="Estimated monthly, if all are fixed"
          tone="success"
        />
        <InsightTile
          icon={Wrench}
          label="Technical issues"
          value={technicalIssues.length}
          tone={technicalIssues.length > 0 ? "warning" : "neutral"}
        />
        <InsightTile
          icon={ClipboardCheck}
          label="Pages affected"
          value={affectedPages.toLocaleString()}
          hint="Across the last audit"
        />
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-2 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <InsightIcon icon={ArrowUpRight} tone="primary" />
            Ranked action list
          </h2>
          <p className="-mt-1 text-xs text-base-content/50">
            Each row estimates the extra monthly clicks a successful fix would
            earn, so the highest-value work sits at the top.
          </p>

          {reportQuery.isPending ? (
            <div className="flex items-center justify-center py-10">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : !report?.connected ? (
            <div className="rounded-lg border border-dashed border-base-300 p-6 text-center">
              <p className="text-sm font-medium">Connect Search Console</p>
              <p className="mx-auto max-w-md text-sm text-base-content/60">
                Keyword opportunities are built from your own Search Console
                data — free, no credits.
              </p>
              <Link
                to="/p/$projectId/search-performance"
                params={{ projectId }}
                className="btn btn-primary btn-sm mt-3"
              >
                Connect Search Console
              </Link>
            </div>
          ) : opportunities.length === 0 ? (
            <div className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
              No keyword opportunities right now — nothing is sitting just off
              page one with meaningful demand.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Keyword</th>
                    <th>Page</th>
                    <th className="text-right">Impressions</th>
                    <th className="text-right">Clicks at stake</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {opportunities.slice(0, OPPORTUNITY_LIMIT).map((row) => (
                    <OpportunityRow
                      key={`${row.kind}-${row.query}-${row.page}`}
                      row={row}
                      projectId={projectId}
                    />
                  ))}
                </tbody>
              </table>
              {opportunities.length > OPPORTUNITY_LIMIT ? (
                <p className="px-1 pt-2 text-xs text-base-content/50">
                  Showing the top {OPPORTUNITY_LIMIT} of{" "}
                  {opportunities.length.toLocaleString()} — work down the list
                  and refresh.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <InsightIcon icon={Wrench} tone="warning" />
              What&rsquo;s missing on your pages
            </h2>
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className="btn btn-ghost btn-xs"
            >
              Open Site Audit
            </Link>
          </div>

          {historyQuery.isPending || auditQuery.isPending ? (
            <div className="flex items-center justify-center py-10">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : latestAuditId == null ? (
            <div className="rounded-lg border border-dashed border-base-300 p-6 text-center">
              <p className="text-sm font-medium">No site audit yet</p>
              <p className="mx-auto max-w-md text-sm text-base-content/60">
                Run one to see missing titles, thin content, broken pages and
                more — the crawl is free.
              </p>
              <Link
                to="/p/$projectId/audit"
                params={{ projectId }}
                className="btn btn-primary btn-sm mt-3"
              >
                Run a site audit
              </Link>
            </div>
          ) : technicalIssues.length === 0 ? (
            <div className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
              No on-page issues found in the last crawl — clean sweep.
            </div>
          ) : (
            <ul className="space-y-2">
              {technicalIssues.map((issue) => (
                <li
                  key={issue.key}
                  className="rounded-lg border border-base-300 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`badge badge-sm ${SEVERITY_CLASS[issue.severity]}`}
                    >
                      {issue.severity}
                    </span>
                    <span className="text-sm font-medium">{issue.label}</span>
                    <span className="text-xs text-base-content/50 tabular-nums">
                      {issue.pageCount.toLocaleString()} page
                      {issue.pageCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-base-content/55">
                    {issue.description}
                  </p>
                  <p className="mt-1 truncate text-xs text-base-content/40">
                    {issue.examples.map((url) => toPath(url)).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function OpportunityRow({
  row,
  projectId,
}: {
  row: Opportunity;
  projectId: string;
}) {
  const meta = KIND_META[row.kind];
  return (
    <tr>
      <td>
        <span className={`badge badge-sm gap-1 ${meta.className}`}>
          <meta.icon className="size-3" />
          {meta.label}
        </span>
      </td>
      <td className="max-w-64">
        <span className="line-clamp-1 font-medium" title={row.query}>
          {row.query}
        </span>
        <span className="line-clamp-1 text-xs text-base-content/50">
          {row.detail}
        </span>
      </td>
      <td className="max-w-72">
        <a
          href={row.page}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-1 text-xs hover:underline"
        >
          {toPath(row.page)}
        </a>
      </td>
      <td className="text-right tabular-nums">
        {row.impressions.toLocaleString()}
      </td>
      <td className="text-right font-semibold tabular-nums">
        +{row.clicksAtStake.toLocaleString()}
      </td>
      <td className="text-right">
        {row.kind === "consolidate" ? (
          <Link
            to="/p/$projectId/cannibalization"
            params={{ projectId }}
            className="btn btn-ghost btn-xs"
          >
            Review
          </Link>
        ) : row.kind === "ctr" ? (
          <Link
            to="/p/$projectId/search-performance"
            params={{ projectId }}
            className="btn btn-ghost btn-xs"
          >
            Review
          </Link>
        ) : (
          <Link
            to="/p/$projectId/content"
            params={{ projectId }}
            search={{ q: row.query }}
            className="btn btn-ghost btn-xs"
          >
            Build brief
          </Link>
        )}
      </td>
    </tr>
  );
}
