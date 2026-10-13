import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppCard } from "@/client/components/AppCard";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { GscAccessNotice } from "@/client/features/gsc/GscAccessNotice";
import { summarizeTechnicalIssues } from "@/client/features/opportunities/technicalIssues";
import type { TechnicalAuditState } from "@/client/features/opportunities/technicalAuditState";
import type { getPageInvestigationPerformance } from "@/serverFunctions/page-investigation";
import type { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";
import { Loader } from "@cloudflare/kumo/components/loader";
type PerformanceQuery = UseQueryResult<
  Awaited<ReturnType<typeof getPageInvestigationPerformance>>
>;
type AuditQuery = UseQueryResult<Awaited<ReturnType<typeof getAuditResults>>>;
type HistoryQuery = UseQueryResult<Awaited<ReturnType<typeof getAuditHistory>>>;
export function PagePerformanceEvidence({
  performance,
  projectId,
}: {
  performance: PerformanceQuery;
  projectId: string;
}) {
  const report = performance.data;
  return (
    <AppCard>
      <h2 className="text-lg font-medium">Observed performance</h2>
      {performance.isError ? (
        <InlineQueryError
          message="Page performance could not be loaded."
          retrying={performance.isFetching}
          onRetry={() => void performance.refetch()}
        />
      ) : performance.isPending ? (
        <Loader />
      ) : report?.connected ? (
        <>
          <p className="text-xs text-base-content/60">
            {report.source} · {report.scope.siteUrl} · {report.range.startDate}–
            {report.range.endDate} · captured {report.fetchedAt}. Compared with{" "}
            {report.range.prevStartDate}–{report.range.prevEndDate}.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Clicks", report.totals.clicks, report.prevTotals.clicks],
                [
                  "Impressions",
                  report.totals.impressions,
                  report.prevTotals.impressions,
                ],
                [
                  "Average position",
                  report.totals.position,
                  report.prevTotals.position,
                ],
              ] as const
            ).map(([label, value, previous]) => (
              <div
                key={label}
                className="rounded-lg border border-base-300 p-3"
              >
                <p className="text-xs">{label}</p>
                <p className="text-xl font-semibold">
                  {report.coverage.currentRows === 0 ||
                  (label === "Average position" &&
                    report.totals.impressions === 0)
                    ? "Unknown"
                    : value.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                </p>
                <p className="text-xs text-base-content/60">
                  Previous:{" "}
                  {report.coverage.previousRows === 0 ||
                  (label === "Average position" &&
                    report.prevTotals.impressions === 0)
                    ? "Unknown"
                    : previous.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                </p>
              </div>
            ))}
          </div>
          {report.coverage.currentRows === 0 ? (
            <p className="text-xs">
              No current page observations were reported. Missing page evidence
              cannot establish zero exposure or a ranking.
            </p>
          ) : null}
          {report.coverage.previousRows === 0 ? (
            <p className="text-xs">
              No previous page observations were reported; this period
              comparison is unavailable.
            </p>
          ) : null}
          {report.coverage.currentTruncated ||
          report.coverage.previousTruncated ? (
            <p className="text-xs">
              Partial daily coverage: totals describe returned rows, and the
              comparison may be incomplete.
            </p>
          ) : null}
          <p className="text-xs text-base-content/60">
            Final-data request. Query rows can omit anonymized terms;{" "}
            {report.coverage.queryRows} returned
            {report.coverage.queryTruncated
              ? ", truncated at the request limit"
              : ""}
            . Average position is an observed report average.
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Supporting queries
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Query</th>
                    <th>Clicks</th>
                    <th>Impressions</th>
                    <th>Position</th>
                  </tr>
                </thead>
                <tbody>
                  {report.queries.map((row) => (
                    <tr key={row.key}>
                      <td>{row.key}</td>
                      <td className="text-center">{row.clicks}</td>
                      <td className="text-center">{row.impressions}</td>
                      <td className="text-center">{row.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <GscAccessNotice
          reason={report?.reason ?? "not_connected"}
          connectLink={{
            to: "/p/$projectId/search-performance",
            params: { projectId },
          }}
        />
      )}
    </AppCard>
  );
}
export function StoredCrawlEvidence({
  audit,
  history,
  url,
  projectId,
  technicalState,
}: {
  audit: AuditQuery;
  history: HistoryQuery;
  url: string;
  projectId: string;
  technicalState: TechnicalAuditState;
}) {
  const page = audit.data?.pages.find((candidate) => candidate.url === url);
  const issues = summarizeTechnicalIssues(page ? [page] : []).issues;
  return (
    <AppCard>
      <h2 className="text-lg font-medium">Stored crawl and content</h2>
      {technicalState === "unavailable" ? (
        <InlineQueryError
          message="Stored crawl evidence is unavailable."
          retrying={history.isFetching || audit.isFetching}
          onRetry={() =>
            void (history.isError ? history.refetch() : audit.refetch())
          }
        />
      ) : technicalState === "loading" ? (
        <Loader />
      ) : technicalState === "not-run" ? (
        <p>
          No completed audit for this website.{" "}
          <Link
            to="/p/$projectId/audit"
            params={{ projectId }}
            className="app-link"
          >
            Open Site Audit
          </Link>{" "}
          to review running jobs or start a crawl.
        </p>
      ) : !page ? (
        <p>
          This exact URL was not captured by the stored audit. Its technical
          state is unknown.
        </p>
      ) : (
        <>
          <p className="text-xs text-base-content/60">
            Stored crawl ·{" "}
            {audit.data?.audit.completedAt ?? audit.data?.audit.startedAt} ·{" "}
            {audit.data?.pages.length} captured pages. Metadata is fetched HTML,
            not rendered-page or field-performance proof.
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt>HTTP response</dt>
              <dd>{page.statusCode ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>
                {page.statusCode === 200
                  ? page.title || "Missing in capture"
                  : "Unavailable without a complete response"}
              </dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>
                {page.statusCode === 200
                  ? page.metaDescription || "Missing in capture"
                  : "Unavailable without a complete response"}
              </dd>
            </div>
            <div>
              <dt>Captured words</dt>
              <dd>{page.statusCode === 200 ? page.wordCount : "Unknown"}</dd>
            </div>
          </dl>
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li
                key={issue.key}
                className="rounded border border-base-300 p-2"
              >
                <p className="text-sm font-medium">{issue.label}</p>
                <p className="text-xs">{issue.description}</p>
              </li>
            ))}
          </ul>
          {issues.length === 0 ? (
            <p className="text-sm">
              No findings from these limited stored checks. This does not
              establish that the page is fully healthy.
            </p>
          ) : null}
        </>
      )}
    </AppCard>
  );
}
