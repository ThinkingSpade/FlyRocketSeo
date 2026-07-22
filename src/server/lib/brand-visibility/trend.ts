/**
 * Pure trend math over stored brand-visibility snapshots. Split out so the
 * ordering and "since last check" delta logic are unit-testable without a
 * database. Snapshots are one-per-day (the repository's unique index), so a
 * lexicographic sort on the `YYYY-MM-DD` capture date is chronological.
 */

export type TrendInputRow = {
  capturedOn: string;
  totalMentions: number | null;
  chatgptMentions: number | null;
  googleMentions: number | null;
  targetSharePct: number | null;
};

export type TrendPoint = TrendInputRow;

export type TrendDelta = {
  /** latest − previous; null when either snapshot lacks the metric. */
  totalMentions: number | null;
  targetSharePct: number | null;
  previousCapturedOn: string;
};

export type BrandVisibilityTrend = {
  /** Oldest → newest, for charting. */
  series: TrendPoint[];
  latest: TrendPoint | null;
  /** Change vs. the prior snapshot; null with fewer than two snapshots. */
  delta: TrendDelta | null;
};

function diff(latest: number | null, previous: number | null): number | null {
  if (latest == null || previous == null) return null;
  return latest - previous;
}

export function buildTrend(rows: TrendInputRow[]): BrandVisibilityTrend {
  const series = [...rows].sort((a, b) =>
    a.capturedOn < b.capturedOn ? -1 : a.capturedOn > b.capturedOn ? 1 : 0,
  );
  const latest = series.at(-1) ?? null;
  const previous = series.length >= 2 ? series[series.length - 2] : null;

  const delta: TrendDelta | null =
    latest && previous
      ? {
          totalMentions: diff(latest.totalMentions, previous.totalMentions),
          targetSharePct: diff(latest.targetSharePct, previous.targetSharePct),
          previousCapturedOn: previous.capturedOn,
        }
      : null;

  return { series, latest, delta };
}
