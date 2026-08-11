import { Empty } from "@cloudflare/kumo/components/empty";
import type { NumericSeriesInformation } from "./backlinksChartInformation";

/**
 * Shared chrome for the backlinks charts: the empty states that stand in for
 * uninformative series, and the two predicates that decide when one applies.
 * Split out of BacklinksPageCharts to keep both files under the repo line
 * limit.
 *
 * The sizing hook, tooltip and legend that used to live here went out with
 * Recharts: ECharts sizes itself, and Kumo's Chart renders both the tooltip
 * and the legend from `options`.
 */

export function EmptyChartState({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const insufficientHistory = title == null;

  return (
    <Empty
      size="sm"
      className="h-56 rounded-none border-0 bg-transparent"
      title={title ?? "Not enough history"}
      description={
        description ??
        (insufficientHistory
          ? "At least 2 monthly snapshots are needed."
          : undefined)
      }
    />
  );
}

type SeriesInformation = NumericSeriesInformation;

export function isStableSeries(information: SeriesInformation) {
  return information.kind === "all-zero" || information.kind === "constant";
}

export function isActivitySeries(information: SeriesInformation) {
  return information.kind === "varying" || information.kind === "constant";
}
