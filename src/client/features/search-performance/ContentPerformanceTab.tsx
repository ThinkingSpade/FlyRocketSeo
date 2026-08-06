import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { resolveQueryState } from "@/client/components/state/queryState";
import { QueryStateBoundary } from "@/client/components/state/QueryStateBoundary";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getContentPerformance } from "@/serverFunctions/searchPerformance";
import type {
  SearchPerformanceDateRange,
  SearchPerformanceDevice,
} from "@/types/schemas/search-performance";
import {
  bucketDeltas,
  buildContentGroups,
  buildPageBuckets,
  type ContentGroupRow,
} from "./contentGroups";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";

type TrendFilter = "all" | "growing" | "decaying";

const BUCKET_TILES = [
  { key: "top3", label: "Top 1–3" },
  { key: "top4to10", label: "Top 4–10" },
  { key: "top11to25", label: "Top 11–25" },
  { key: "top26to100", label: "Top 26–100" },
] as const;

function formatDelta(value: number | null): string {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function DeltaText({ value }: { value: number | null }) {
  if (value == null) return <span className="text-base-content/40">—</span>;
  const tone =
    value > 0
      ? "text-success"
      : value < 0
        ? "text-error"
        : "text-base-content/50";
  return <span className={`text-xs ${tone}`}>{formatDelta(value)}</span>;
}

/**
 * Rank-analyzer view of the site's own pages: how many rank in each position
 * band, and how each content group is trending. All from free GSC page data
 * for the current period and the one before it.
 */
export function ContentPerformanceTab({
  projectId,
  dateRange,
  device,
  country,
}: {
  projectId: string;
  dateRange: SearchPerformanceDateRange;
  device?: SearchPerformanceDevice;
  country?: string;
}) {
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all");

  const contentQuery = useQuery({
    queryKey: ["contentPerformance", projectId, dateRange, device, country],
    queryFn: () =>
      getContentPerformance({
        data: {
          projectId,
          dateRange,
          ...(device ? { device } : {}),
          ...(country ? { country } : {}),
        },
      }),
  });

  const data = contentQuery.data;
  const connected = data?.connected === true;

  const buckets = useMemo(
    () => (connected ? buildPageBuckets(data.current) : null),
    [connected, data],
  );
  const previousBuckets = useMemo(
    () => (connected ? buildPageBuckets(data.previous) : null),
    [connected, data],
  );
  const groups = useMemo(
    () => (connected ? buildContentGroups(data.current, data.previous) : []),
    [connected, data],
  );

  const deltas =
    buckets && previousBuckets ? bucketDeltas(buckets, previousBuckets) : null;

  const filteredGroups = groups.filter((group) => {
    if (trendFilter === "growing") return (group.clicksDelta ?? 0) > 0;
    if (trendFilter === "decaying") return (group.clicksDelta ?? 0) < 0;
    return true;
  });

  // Lifecycle for the tab as a whole. Before this, `isError` was never checked
  // and a failed read fell into the `!connected` branch, so a Google outage
  // rendered as "Connect Search Console" — telling the user to fix a connection
  // that was never broken.
  const tabState = resolveQueryState({
    isPending: contentQuery.isPending,
    isError: contentQuery.isError,
    connected: data?.connected,
    // One response object, not a row set: zero pages in the period is still a
    // valid answer and belongs in the tiles below, not in an empty state.
    rowCount: connected && buckets ? 1 : 0,
  });

  // The content-group list gets its own state because its emptiness rests on
  // BOTH period pulls: `growing`/`decaying` are computed from a delta, so a
  // capped previous period can hide a group just as easily as a capped current
  // one. The old copy only ever checked `current`.
  const groupsState = resolveQueryState({
    isPending: false,
    isError: false,
    connected: true,
    rowCount: filteredGroups.length,
    filtered: trendFilter !== "all",
    sampling: connected
      ? [
          {
            label: "The current-period Search Console page pull",
            truncated: data.sampling.current.truncated,
            rowsExamined: data.sampling.current.rowsExamined,
          },
          {
            label: "The previous-period Search Console page pull",
            truncated: data.sampling.previous.truncated,
            rowsExamined: data.sampling.previous.rowsExamined,
          },
        ]
      : [],
  });
  const periodsAreSampled =
    connected &&
    (data.sampling.current.truncated || data.sampling.previous.truncated);

  return (
    <QueryStateBoundary
      state={tabState}
      loading={
        <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Loading content
          performance…
        </div>
      }
      errorMessage={getStandardErrorMessage(contentQuery.error)}
      notConnected={
        <div className="p-4 text-sm text-base-content/60">
          Connect Search Console to see how your pages and content groups are
          performing.
        </div>
      }
      emptyTitle="No page data came back for this period"
      emptyBody="Search Console answered without page rows. Try a wider date range."
    >
      {/* The boundary has already ruled out every other state; this only
          narrows the types it cannot narrow for us. */}
      {buckets ? (
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {BUCKET_TILES.map((tile) => (
              <div
                key={tile.key}
                className="rounded-lg border border-base-300 bg-base-100 p-3"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                  {tile.label}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums">
                    {buckets[tile.key].toLocaleString()}
                  </span>
                  <span className="text-xs text-base-content/50">pages</span>
                </div>
                <DeltaText value={deltas?.[tile.key] ?? null} />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-base-300 bg-base-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <InsightIcon icon={Layers} tone="primary" />
                Content groups
              </h3>
              <SegmentedToggle
                showLabels
                items={[
                  { value: "all", label: "All" },
                  { value: "growing", label: "Growing" },
                  { value: "decaying", label: "Decaying" },
                ]}
                value={trendFilter}
                onChange={setTrendFilter}
              />
            </div>
            <p className="mt-0.5 text-xs text-base-content/50">
              Your pages grouped by what they are, compared with the previous
              period — so you can see which kind of content is winning.
            </p>

            <QueryStateBoundary
              state={groupsState}
              loading={null}
              errorMessage=""
              emptyTitle="No content groups in this period"
              emptyBody="Groups appear once Search Console reports pages whose URLs fall into recognisable sections."
              filteredTitle={`No ${trendFilter} content groups in this period`}
              filteredBody={
                trendFilter === "growing"
                  ? "Nothing gained clicks against the previous period. Clear the filter to see the rest."
                  : "Nothing lost clicks against the previous period. Clear the filter to see the rest."
              }
            >
              {/* Row counts and completeness are the boundary's job; this
                  sentence is about a different fact — that a delta between two
                  independently sampled populations can show movement the whole
                  data set does not have. It is only true when a pull was
                  actually capped, so it stays conditional. */}
              {periodsAreSampled ? (
                <p className="mt-2 text-xs text-base-content/50">
                  The two periods are capped separately, so they can contain
                  different pages and a page can leave the sample without
                  leaving the site. Treat the comparison as directional.
                </p>
              ) : null}
              <div className="mt-2 overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th className="text-right">Pages</th>
                      <th className="text-right">Clicks</th>
                      <th className="text-right">Impressions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map((group) => (
                      <ContentGroupRowView key={group.key} group={group} />
                    ))}
                  </tbody>
                </table>
              </div>
            </QueryStateBoundary>
          </div>
        </div>
      ) : null}
    </QueryStateBoundary>
  );
}

function ContentGroupRowView({ group }: { group: ContentGroupRow }) {
  const growing = (group.clicksDelta ?? 0) > 0;
  const decaying = (group.clicksDelta ?? 0) < 0;
  return (
    <tr>
      <td>
        <span className="inline-flex items-center gap-1.5 font-medium">
          {growing ? (
            <TrendingUp className="size-3.5 text-success/80" />
          ) : decaying ? (
            <TrendingDown className="size-3.5 text-error/80" />
          ) : null}
          {group.label}
        </span>
      </td>
      <td className="text-right tabular-nums text-base-content/70">
        {group.pageCount.toLocaleString()}
      </td>
      <td className="text-right tabular-nums">
        {group.clicks.toLocaleString()} <DeltaText value={group.clicksDelta} />
      </td>
      <td className="text-right tabular-nums">
        {group.impressions.toLocaleString()}{" "}
        <DeltaText value={group.impressionsDelta} />
      </td>
    </tr>
  );
}
