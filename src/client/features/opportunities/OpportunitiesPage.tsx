import { useMemo } from "react";
import {
  auditHistoryKey,
  auditResultsKey,
} from "@/client/features/audit/auditQueryKeys";
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
  excludeWrongCustomer,
  isSourceUnavailable,
} from "./opportunityModel";
import { AppPageShell } from "@/client/components/AppPageShell";
import { ProjectProfileCard } from "@/client/features/profiles/ProjectProfileCard";
import {
  useKeywordFit,
  useProjectProfile,
} from "@/client/features/profiles/useProjectProfile";
import { summarizeTechnicalIssues } from "./technicalIssues";
import { getTechnicalAuditState } from "./technicalAuditState";
import { OpportunityTiles } from "./OpportunityTiles";
import { OpportunityRow } from "./OpportunityRow";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Loader } from "@cloudflare/kumo/components/loader";
import { buttonVariants } from "@cloudflare/kumo/components/button";
import { Table } from "@cloudflare/kumo/components/table";
import { OpportunityWork } from "./OpportunityWork";

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
    queryKey: auditHistoryKey(projectId),
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });
  const latestAuditId = historyQuery.data?.find(
    (audit) => audit.status === "completed",
  )?.id;
  const auditQuery = useQuery({
    enabled: latestAuditId != null,
    queryKey: auditResultsKey(projectId, latestAuditId),
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

  // The profile editor is mounted directly below this list, and until now the
  // ranking never asked it anything. Both halves are free: one D1 read for the
  // profile, then pure string work over queries already in memory (keywordFit.ts).
  const { profile } = useProjectProfile(projectId);
  const queries = useMemo(
    () => opportunities.map((row) => row.query),
    [opportunities],
  );
  const fit = useKeywordFit(profile, queries);
  const { kept: ranked, excluded: wrongCustomer } = useMemo(
    () => excludeWrongCustomer(opportunities, fit),
    [opportunities, fit],
  );

  const { issues: technicalIssues, affectedPages } = useMemo(
    () => summarizeTechnicalIssues(auditQuery.data?.pages ?? []),
    [auditQuery.data],
  );

  // Either GSC source being capped makes an absence claim unsafe here, since
  // this list is assembled from both.
  const sampled =
    (report?.connected ? report.sampling.queryPages.truncated : false) ||
    (linkInsights?.connected ? linkInsights.truncated : false);

  // Keep separate tasks, but do not add scenarios that can share impressions.
  const largestClickScenario = ranked.reduce(
    (largest, item) => Math.max(largest, item.clicksAtStake),
    0,
  );
  const sourcesUnavailable =
    isSourceUnavailable(reportQuery, report) ||
    isSourceUnavailable(linkInsightsQuery, linkInsights);
  const technicalState = getTechnicalAuditState(
    historyQuery,
    auditQuery,
    latestAuditId,
    auditQuery.data?.pages,
  );

  return (
    <AppPageShell>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Lightbulb className="size-6" />
          SEO Opportunities
        </h1>
        <p className="text-sm text-base-content/60">
          Find your next SEO action using Search Console evidence and your
          latest stored site audit. Opening this page does not run a paid
          lookup.
        </p>
      </div>

      <ProjectProfileCard projectId={projectId} />
      <OpportunityWork projectId={projectId} />

      <OpportunityTiles
        opportunities={ranked}
        sourcesUnavailable={sourcesUnavailable}
        sampled={sampled}
        technicalState={technicalState}
        technicalIssueCount={technicalIssues.length}
        affectedPages={affectedPages}
        largestClickScenario={largestClickScenario}
      />

      <details className="rounded-lg border border-base-300 p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          How priorities are estimated
        </summary>
        <p className="mt-2 text-base-content/60">
          Search Console supplies observed impressions and average position, not
          predicted traffic. Ranking scenarios assume an uncalibrated 11% CTR at
          a top-three position; overlap scenarios also assume 30% recovery of
          the split share. CTR opportunities use a separate fixed CTR model.
          These assumptions may not fit your site. Inspect search intent and
          page evidence before changing or consolidating content.
        </p>
        {report?.connected ? (
          <p className="mt-2 text-base-content/60">
            Search Console evidence: {report.range.startDate} to{" "}
            {report.range.endDate}.
          </p>
        ) : null}
      </details>

      <AppCard>
        <SectionHeader
          headingLevel={2}
          icon={ArrowUpRight}
          title="Ranked action list"
          description={
            <>
              Ranked by hypothetical click scenarios from the last 28 days of
              available Search Console data. These are not forecasts or promised
              gains, and overlapping scenarios must not be added together.
              {sampled
                ? " Search Console caps how many rows it returns, ordered by clicks, so this ranks what we could read rather than everything you rank for."
                : ""}
              {/* Named rather than silently applied. The verdict comes from the
                  exclusions the user typed above, so a row missing in error is
                  legible as a wrong exclusion line rather than a vanished
                  opportunity. Suppressed once the list is empty, where the
                  card below says the same thing with the whole story. */}
              {wrongCustomer > 0 && ranked.length > 0
                ? ` ${wrongCustomer} ${wrongCustomer === 1 ? "query is" : "queries are"} left out as somebody else's customer, going by your profile above.`
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
          <div className="flex flex-col items-center rounded-lg border border-dashed border-base-300 p-6 text-center">
            <p className="text-sm font-medium">Connect Search Console</p>
            <p className="mx-auto max-w-md text-sm text-base-content/60">
              Keyword opportunities are built from your own Search Console data
              — no paid SEO-provider lookup.
            </p>
            <Link
              to="/p/$projectId/search-performance"
              params={{ projectId }}
              className={`${buttonVariants({ variant: "primary", size: "sm" })} mt-3`}
            >
              Connect Search Console
            </Link>
          </div>
        ) : ranked.length === 0 ? (
          <div className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
            {/* An emptied list is not an empty one. Saying "nothing is sitting
                just off page one" after the fit pass removed everything would
                report an absence we created. */}
            {wrongCustomer > 0
              ? `Every keyword opportunity we found is for somebody else's customer, going by your profile above (${wrongCustomer} left out). Loosen an exclusion line if that looks wrong.`
              : sampled
                ? "No keyword opportunities in the rows Search Console returned. It sends them ordered by clicks and caps the pull, so something off page one with real demand could be outside it."
                : "No opportunities matched these checks in the available Search Console rows. This does not establish that the site has no other opportunities."}
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
                  <Table.Head className="text-right">Click scenario</Table.Head>
                  <Table.Head />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {ranked.slice(0, OPPORTUNITY_LIMIT).map((row) => (
                  <OpportunityRow
                    key={`${row.kind}-${row.query}-${row.page}`}
                    row={row}
                    projectId={projectId}
                    window={report.range}
                  />
                ))}
              </Table.Body>
            </Table>
            {ranked.length > OPPORTUNITY_LIMIT ? (
              <p className="px-1 pt-2 text-xs text-base-content/50">
                Showing the top {OPPORTUNITY_LIMIT} of{" "}
                {ranked.length.toLocaleString()} — work down the list and
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
          title="Technical checks to review"
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

        {technicalState === "unavailable" ? (
          <InlineQueryError
            message={
              historyQuery.isError
                ? "Site audit history could not be loaded."
                : "The latest site audit results could not be loaded."
            }
            retrying={
              historyQuery.isError
                ? historyQuery.isFetching
                : auditQuery.isFetching
            }
            onRetry={() =>
              void (historyQuery.isError
                ? historyQuery.refetch()
                : auditQuery.refetch())
            }
          />
        ) : technicalState === "loading" ? (
          <div className="flex items-center justify-center py-10">
            <Loader size="base" />
          </div>
        ) : technicalState === "not-run" ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-base-300 p-6 text-center">
            <p className="text-sm font-medium">No site audit yet</p>
            <p className="mx-auto max-w-md text-sm text-base-content/60">
              No completed crawl is available. Open Site Audit to check any
              running or failed crawl, or review the options for starting one.
            </p>
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className={`${buttonVariants({ variant: "primary", size: "sm" })} mt-3`}
            >
              Run a site audit
            </Link>
          </div>
        ) : technicalState === "empty" ? (
          <div className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
            No page evidence was stored by the completed crawl. Open Site Audit
            to investigate coverage before drawing conclusions.
          </div>
        ) : technicalIssues.length === 0 ? (
          <div className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
            No findings from these checks on the stored crawl pages. This is not
            a complete assessment of indexing, content quality, or site health.
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
