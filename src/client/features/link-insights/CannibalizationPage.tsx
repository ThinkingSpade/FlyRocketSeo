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
import { QueryStateBoundary } from "@/client/components/state/QueryStateBoundary";
import { resolveQueryState } from "@/client/components/state/queryState";
import { AppPageShell } from "@/client/components/AppPageShell";
import type { ComponentProps } from "react";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { buttonVariants } from "@cloudflare/kumo/components/button";
import { Table } from "@cloudflare/kumo/components/table";

const SEVERITY_BADGE: Record<
  CannibalizationSeverity,
  {
    label: string;
    variant: ComponentProps<typeof Badge>["variant"];
    hint: string;
  }
> = {
  high: {
    label: "High",
    variant: "error",
    hint: "Clicks are spread nearly evenly across these pages on a high-impression query — investigate this one first",
  },
  medium: {
    label: "Medium",
    variant: "warning",
    hint: "A meaningful share of clicks goes to pages other than the top-clicked one",
  },
  low: {
    label: "Low",
    variant: "neutral",
    hint: "One page takes almost all the clicks — keep an eye on it",
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
    <AppPageShell>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Split className="size-6" />
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
          <Loader size="base" />
        </div>
      ) : null}

      {insightsQuery.isError ? (
        <Banner variant="error" className="text-sm">
          {getStandardErrorMessage(insightsQuery.error)}
        </Banner>
      ) : null}

      {data && !data.connected ? (
        <div className="relative flex flex-col rounded-xl border border-dashed border-base-300">
          <div className="flex flex-auto flex-col items-center py-12 text-center gap-2">
            <p className="font-medium">Connect Search Console first</p>
            <p className="max-w-md text-sm text-base-content/60">
              Cannibalization detection is built from your own Search Console
              data.
            </p>
            <Link
              to="/p/$projectId/search-performance"
              params={{ projectId }}
              className={`${buttonVariants({ variant: "primary", size: "sm" })} mt-2`}
            >
              Go to GSC Insights
            </Link>
          </div>
        </div>
      ) : null}

      {/* First consumer of QueryStateBoundary. The hand-written truncated/complete
          ternary this replaces was correct, but it was the twelfth copy of the
          same reasoning — and getting it wrong is invisible until a client acts
          on a false all-clear. The boundary owns the rule now: an unestablished
          absence cannot render the confident sentence, because the caller never
          gets the chance to supply it. */}
      {data?.connected && rows.length === 0 ? (
        <div className="relative flex flex-col rounded-xl border border-dashed border-base-300">
          <div className="flex flex-auto flex-col items-center py-6 gap-2 text-sm">
            <QueryStateBoundary
              state={resolveQueryState({
                isPending: false,
                isError: false,
                connected: true,
                rowCount: rows.length,
                sampling: [
                  {
                    label: "The Search Console query-and-page pull",
                    truncated: data.truncated,
                    rowsExamined: data.rowsExamined,
                  },
                ],
              })}
              loading={null}
              errorMessage="Cannibalization data could not be loaded."
              emptyTitle="No cannibalization detected"
              emptyBody="No query currently has two of your pages splitting meaningful impressions — that's a healthy site."
            >
              {null}
            </QueryStateBoundary>
          </div>
        </div>
      ) : null}

      {rows.map((row) => (
        <div
          key={row.query}
          className="relative flex flex-col rounded-xl border border-base-300 bg-base-100"
        >
          <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <Badge variant="outline">{row.query}</Badge>
                <span title={SEVERITY_BADGE[row.severity].hint}>
                  <Badge variant={SEVERITY_BADGE[row.severity].variant}>
                    {SEVERITY_BADGE[row.severity].label}
                  </Badge>
                </span>
              </span>
              <span className="text-xs text-base-content/50 tabular-nums">
                {Math.round(row.splitShare * 100)}% of clicks outside the
                top-clicked page · {row.totalImpressions.toLocaleString()}{" "}
                impressions · {row.totalClicks.toLocaleString()} clicks ·{" "}
                {row.pages.length} ranking pages
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Page</Table.Head>
                    <Table.Head className="text-right">Position</Table.Head>
                    <Table.Head className="text-right">Clicks</Table.Head>
                    <Table.Head className="text-right">Impressions</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {row.pages.map((page) => (
                    <Table.Row key={page.page}>
                      <Table.Cell className="max-w-md">
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
                            <span title="Best-RANKING page for this query, and so the likely consolidation target if these really do compete. Not necessarily the page earning the most clicks.">
                              <Badge variant="success">
                                <Trophy className="size-3" /> best rank
                              </Badge>
                            </span>
                          ) : null}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {Math.round(page.position)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {page.clicks.toLocaleString()}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {page.impressions.toLocaleString()}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
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
    </AppPageShell>
  );
}
