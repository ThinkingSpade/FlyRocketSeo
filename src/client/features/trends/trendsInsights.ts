// Pure momentum/seasonality stats for the Keyword Trends table (no I/O),
// split out so the window math is unit-testable.

type TrendsSeriesPoint = {
  timestamp: number;
  values: (number | null)[];
};

export type TrendMomentum = "rising" | "stable" | "falling";

export type KeywordTrendInsight = {
  keyword: string;
  /** Most recent non-null interest value. */
  latest: number | null;
  /** Percent change: last 90 days vs the 90 days before, or null. */
  momentumPercent: number | null;
  momentum: TrendMomentum | null;
  /** Percent change: latest vs the value ~a year earlier, or null. */
  yoyPercent: number | null;
  /** Calendar month (0-11) with the highest average interest, or null. */
  peakMonth: number | null;
  /** Calendar month (0-11) with the lowest average interest, or null. */
  lowMonth: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MOMENTUM_WINDOW_MS = 90 * DAY_MS;
/** Momentum below ±10% reads as noise on a 0-100 interest scale. */
const STABLE_THRESHOLD_PERCENT = 10;
/** Peak/low months need most of a year of data to mean anything. */
const SEASONALITY_MIN_SPAN_MS = 300 * DAY_MS;

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Compute per-keyword momentum and seasonality from a shared series. */
export function computeTrendInsights(
  keywords: string[],
  points: TrendsSeriesPoint[],
): KeywordTrendInsight[] {
  const sorted = points.toSorted((a, b) => a.timestamp - b.timestamp);
  const maxTs = sorted[sorted.length - 1]?.timestamp ?? 0;
  const minTs = sorted[0]?.timestamp ?? 0;
  const spansYear = maxTs - minTs >= SEASONALITY_MIN_SPAN_MS;

  return keywords.map((keyword, index) => {
    const series = sorted
      .map((point) => ({
        timestamp: point.timestamp,
        value: point.values[index],
      }))
      .filter(
        (point): point is { timestamp: number; value: number } =>
          point.value != null,
      );

    const latest = series[series.length - 1]?.value ?? null;

    // Momentum: last 90 days vs the 90 days before that.
    const recent = series.filter(
      (p) => p.timestamp > maxTs - MOMENTUM_WINDOW_MS,
    );
    const prior = series.filter(
      (p) =>
        p.timestamp <= maxTs - MOMENTUM_WINDOW_MS &&
        p.timestamp > maxTs - 2 * MOMENTUM_WINDOW_MS,
    );
    const recentAvg = average(recent.map((p) => p.value));
    const priorAvg = average(prior.map((p) => p.value));
    const momentumPercent =
      recent.length >= 3 &&
      prior.length >= 3 &&
      recentAvg != null &&
      priorAvg != null
        ? percentChange(recentAvg, priorAvg)
        : null;
    const momentum: TrendMomentum | null =
      momentumPercent == null
        ? null
        : momentumPercent >= STABLE_THRESHOLD_PERCENT
          ? "rising"
          : momentumPercent <= -STABLE_THRESHOLD_PERCENT
            ? "falling"
            : "stable";

    // Year over year: latest vs the point closest to a year before the series
    // end (±3 weeks tolerance).
    let yoyPercent: number | null = null;
    if (latest != null) {
      const target = maxTs - 365 * DAY_MS;
      const tolerance = 21 * DAY_MS;
      let best: { distance: number; value: number } | null = null;
      for (const point of series) {
        const distance = Math.abs(point.timestamp - target);
        if (
          distance <= tolerance &&
          (best == null || distance < best.distance)
        ) {
          best = { distance, value: point.value };
        }
      }
      if (best) yoyPercent = percentChange(latest, best.value);
    }

    // Seasonality: average interest per calendar month.
    let peakMonth: number | null = null;
    let lowMonth: number | null = null;
    if (spansYear && series.length > 0) {
      const byMonth = new Map<number, number[]>();
      for (const point of series) {
        const month = new Date(point.timestamp).getUTCMonth();
        const bucket = byMonth.get(month) ?? [];
        bucket.push(point.value);
        byMonth.set(month, bucket);
      }
      let peak: { month: number; avg: number } | null = null;
      let low: { month: number; avg: number } | null = null;
      for (const [month, values] of byMonth) {
        const avg = average(values);
        if (avg == null) continue;
        if (peak == null || avg > peak.avg) peak = { month, avg };
        if (low == null || avg < low.avg) low = { month, avg };
      }
      peakMonth = peak?.month ?? null;
      lowMonth = low?.month ?? null;
    }

    return {
      keyword,
      latest,
      momentumPercent,
      momentum,
      yoyPercent,
      peakMonth,
      lowMonth,
    };
  });
}
