import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Split, Trophy } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  scoreCannibalization,
  type CannibalizationSeverity,
} from "@/client/features/link-insights/cannibalizationSeverity";
import {
  toPath,
  useLinkInsights,
} from "@/client/features/link-insights/useLinkInsights";

const SEVERITY_BADGE: Record<
  CannibalizationSeverity,
  { label: string; className: string; hint: string }
> = {
  high: {
    label: "High",
    className: "badge-error",
    hint: "Clicks are spread nearly evenly across these pages on a high-impression query — investigate this one first",
  },
  medium: {
    label: "Medium",
    className: "badge-warning",
    hint: "A meaningful share of traffic goes to pages other than the leading one",
  },
  low: {
    label: "Low",
    className: "badge-ghost",
    hint: "One page clearly leads — keep an eye on it",
  },
};

export function CannibalizationPage({ projectId }: { projectId: string }) {
  const insightsQuery = useLinkInsights(projectId);
  const data = insightsQuery.data;
  const rows = useMemo(
    () => scoreCannibalization(data?.connected ? data.cannibalization : []),
    [data],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Split className="size-5" />
          Cannibalization
        </h1>
        {/* States what the data shows, then what it might mean — in that order.
            The request dimensions are query and page only, so we observe that
            several of your URLs rank for one query. Whether they COMPETE, and
            whether clicks are being split as a result, needs device, country,
            date and same-SERP coexistence that we never asked for. Asserting the
            cause led straight to "consolidate these", which is destructive
            advice to give on an inference. */}
        <p className="text-sm text-base-content/60">
          Queries where two or more of your pages both rank. That often means
          they compete and split clicks — worth consolidating into one, or
          differentiating onto separate keywords — but Search Console
          doesn&rsquo;t show whether they appeared in the same results, so check
          before merging anything.
        </p>
      </div>

      {insightsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}

      {insightsQuery.isError ? (
        <div className="alert alert-error text-sm">
          {getStandardErrorMessage(insightsQuery.error)}
        </div>
      ) : null}

      {data && !data.connected ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">Connect Search Console first</p>
            <p className="max-w-md text-sm text-base-content/60">
              Cannibalization detection is built from your own Search Console
              data.
            </p>
            <Link
              to="/p/$projectId/search-performance"
              params={{ projectId }}
              className="btn btn-primary btn-sm mt-2"
            >
              Go to GSC Insights
            </Link>
          </div>
        </div>
      ) : null}

      {data?.connected && rows.length === 0 ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            {data.truncated ? (
              <>
                <p className="font-medium">
                  None found in the queries we could check
                </p>
                <p className="max-w-md text-sm text-base-content/60">
                  Search Console returned {data.rowsExamined.toLocaleString()}{" "}
                  query-and-page rows, ordered by clicks, and capped the pull
                  there. No overlap among those — but this isn&rsquo;t your
                  whole site, so it isn&rsquo;t an all-clear.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">No cannibalization detected</p>
                <p className="max-w-md text-sm text-base-content/60">
                  No query currently has two of your pages splitting meaningful
                  impressions — that&rsquo;s a healthy site.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {rows.map((row) => (
        <div
          key={row.query}
          className="card border border-base-300 bg-base-100"
        >
          <div className="card-body gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <span className="badge badge-primary badge-outline">
                  {row.query}
                </span>
                <span
                  className={`badge badge-sm ${SEVERITY_BADGE[row.severity].className}`}
                  title={SEVERITY_BADGE[row.severity].hint}
                >
                  {SEVERITY_BADGE[row.severity].label}
                </span>
              </span>
              <span className="text-xs text-base-content/50 tabular-nums">
                {Math.round(row.splitShare * 100)}% of traffic outside the
                leading page · {row.totalImpressions.toLocaleString()}{" "}
                impressions · {row.totalClicks.toLocaleString()} clicks ·{" "}
                {row.pages.length} ranking pages
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th className="text-right">Position</th>
                    <th className="text-right">Clicks</th>
                    <th className="text-right">Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {row.pages.map((page) => (
                    <tr key={page.page}>
                      <td className="max-w-md">
                        <span className="inline-flex items-center gap-1.5">
                          <a
                            href={page.page}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-1 hover:underline"
                          >
                            {toPath(page.page)}
                          </a>
                          {page.isWinner ? (
                            <span
                              className="badge badge-success badge-sm gap-1"
                              title="Leading page for this query — the likely consolidation target if these really do compete"
                            >
                              <Trophy className="size-3" /> leading
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">
                        {Math.round(page.position)}
                      </td>
                      <td className="text-right tabular-nums">
                        {page.clicks.toLocaleString()}
                      </td>
                      <td className="text-right tabular-nums">
                        {page.impressions.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      {data?.connected ? (
        <p className="text-xs text-base-content/40">
          Based on Search Console data {data.range.startDate} –{" "}
          {data.range.endDate}. Free — uses your own GSC data.
        </p>
      ) : null}
    </div>
  );
}
