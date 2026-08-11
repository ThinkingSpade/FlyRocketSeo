import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Lightbulb, Wrench } from "@phosphor-icons/react";
import { AppCard } from "@/client/components/AppCard";
import { SectionHeader } from "@/client/components/SectionHeader";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";
import { scoreCannibalization } from "@/client/features/link-insights/cannibalizationSeverity";
import { useLinkInsights } from "@/client/features/link-insights/useLinkInsights";
import { toPath } from "@/client/features/link-insights/useLinkInsights";
import {
  buildOpportunities,
  buildTechnicalIssues,
  isSourceUnavailable,
} from "./opportunityModel";
import { AppPageShell } from "@/client/components/AppPageShell";
import { ProjectProfileCard } from "@/client/features/profiles/ProjectProfileCard";
import { OpportunityTiles } from "./OpportunityTiles";
import { OpportunityRow } from "./OpportunityRow";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Loader } from "@cloudflare/kumo/components/loader";
import { buttonVariants } from "@cloudflare/kumo/components/button";
import { Table } from "@cloudflare/kumo/components/table";

const SEVERITY_CLASS = {
  high: "error",
  medium: "warning",
  low: "neutral",
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

  // Either GSC source being capped makes an absence claim unsafe here, since
  // this list is assembled from both.
  const sampled =
    (report?.connected ? report.sampling.queryPages.truncated : false) ||
    (linkInsights?.connected ? linkInsights.truncated : false);

  const totalClicksAtStake = opportunities.reduce(
    (sum, item) => sum + item.clicksAtStake,
    0,
  );
  const affectedPages = technicalIssues.reduce(
    (sum, issue) => sum + issue.pageCount,
    0,
  );
  const sourcesUnavailable =
    isSourceUnavailable(reportQuery, report) ||
    isSourceUnavailable(linkInsightsQuery, linkInsights);
  const technicalSourcesFailed = historyQuery.isError || auditQuery.isError;

  return (
    <AppPageShell>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Lightbulb className="size-6" />
          SEO Opportunities
        </h1>
        <p className="text-sm text-base-content/60">
          What to fix next, ranked by the traffic at stake — built from your
          Search Console data and your latest site audit. Nothing here costs a
          credit.
        </p>
      </div>

      <ProjectProfileCard projectId={projectId} />

      <OpportunityTiles
        opportunities={opportunities}
        sourcesUnavailable={sourcesUnavailable}
        sampled={sampled}
        technicalSourcesFailed={technicalSourcesFailed}
        technicalIssueCount={technicalIssues.length}
        affectedPages={affectedPages}
        totalClicksAtStake={totalClicksAtStake}
      />

      <AppCard>
        <SectionHeader
          headingLevel={2}
          icon={ArrowUpRight}
          title="Ranked action list"
          description={
            <>
              Each row estimates the extra monthly clicks a successful fix would
              earn, so the highest-value work sits at the top.
              {sampled
                ? " Search Console caps how many rows it returns, ordered by clicks, so this ranks what we could read rather than everything you rank for."
                : ""}
            </>
          }
        />

        {reportQuery.isError || linkInsightsQuery.isError ? (
          <div className="space-y-2">
            {reportQuery.isError ? (
              <InlineQueryError
                message="Search Console opportunities could not be loaded."
                retrying={reportQuery.isFetching}
                onRetry={() => void reportQuery.refetch()}
              />
            ) : null}
            {linkInsightsQuery.isError ? (
              <InlineQueryError
                message="Link and cannibalization insights could not be loaded."
                retrying={linkInsightsQuery.isFetching}
                onRetry={() => void linkInsightsQuery.refetch()}
              />
            ) : null}
          </div>
        ) : reportQuery.isPending || linkInsightsQuery.isPending ? (
          <div className="flex items-center justify-center py-10">
            <Loader size="base" />
          </div>
        ) : !report?.connected ? (
          <div className="rounded-lg border border-dashed border-base-300 p-6 text-center">
            <p className="text-sm font-medium">Connect Search Console</p>
            <p className="mx-auto max-w-md text-sm text-base-content/60">
              Keyword opportunities are built from your own Search Console data
              — free, no credits.
            </p>
            <Link
              to="/p/$projectId/search-performance"
              params={{ projectId }}
              className={`${buttonVariants({ variant: "primary", size: "sm" })} mt-3`}
            >
              Connect Search Console
            </Link>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
            {sampled
              ? "No keyword opportunities in the rows Search Console returned. It sends them ordered by clicks and caps the pull, so something off page one with real demand could be outside it."
              : "No keyword opportunities right now — nothing is sitting just off page one with meaningful demand."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Action</Table.Head>
                  <Table.Head>Keyword</Table.Head>
                  <Table.Head>Page</Table.Head>
                  <Table.Head className="text-right">Impressions</Table.Head>
                  <Table.Head className="text-right">
                    Clicks at stake
                  </Table.Head>
                  <Table.Head />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {opportunities.slice(0, OPPORTUNITY_LIMIT).map((row) => (
                  <OpportunityRow
                    key={`${row.kind}-${row.query}-${row.page}`}
                    row={row}
                    projectId={projectId}
                  />
                ))}
              </Table.Body>
            </Table>
            {opportunities.length > OPPORTUNITY_LIMIT ? (
              <p className="px-1 pt-2 text-xs text-base-content/50">
                Showing the top {OPPORTUNITY_LIMIT} of{" "}
                {opportunities.length.toLocaleString()} — work down the list and
                refresh.
              </p>
            ) : null}
          </div>
        )}
      </AppCard>

      <AppCard>
        <SectionHeader
          headingLevel={2}
          icon={Wrench}
          title={<>What&rsquo;s missing on your pages</>}
          actions={
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className={buttonVariants({ variant: "ghost", size: "xs" })}
            >
              Open Site Audit
            </Link>
          }
        />

        {historyQuery.isError || auditQuery.isError ? (
          <div className="space-y-2">
            {historyQuery.isError ? (
              <InlineQueryError
                message="Site audit history could not be loaded."
                retrying={historyQuery.isFetching}
                onRetry={() => void historyQuery.refetch()}
              />
            ) : null}
            {auditQuery.isError ? (
              <InlineQueryError
                message="The latest site audit results could not be loaded."
                retrying={auditQuery.isFetching}
                onRetry={() => void auditQuery.refetch()}
              />
            ) : null}
          </div>
        ) : historyQuery.isPending || auditQuery.isPending ? (
          <div className="flex items-center justify-center py-10">
            <Loader size="base" />
          </div>
        ) : latestAuditId == null ? (
          <div className="rounded-lg border border-dashed border-base-300 p-6 text-center">
            <p className="text-sm font-medium">No site audit yet</p>
            <p className="mx-auto max-w-md text-sm text-base-content/60">
              Run one to see missing titles, thin content, broken pages and more
              — the crawl is free.
            </p>
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className={`${buttonVariants({ variant: "primary", size: "sm" })} mt-3`}
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
                  <Badge variant={SEVERITY_CLASS[issue.severity]}>
                    {issue.severity}
                  </Badge>
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
      </AppCard>
    </AppPageShell>
  );
}
