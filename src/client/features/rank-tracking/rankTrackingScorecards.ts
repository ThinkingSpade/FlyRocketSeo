import type { RankTrackingRow } from "@/types/schemas/rank-tracking";

// Approximate organic CTR by position (index = position; aggregate industry
// curves). Only used to weight the visibility metric, so relative weights
// matter, not exact values. Positions past the list fall back to a small CTR.
const CTR_BY_POSITION = [
  0, 0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.033, 0.028, 0.024, 0.021, 0.018,
  0.016, 0.014, 0.012, 0.011, 0.01, 0.009, 0.008, 0.007, 0.006,
];
const TOP_CTR = CTR_BY_POSITION[1];

function ctr(position: number | null): number {
  if (position === null || position < 1) return 0;
  return CTR_BY_POSITION[position] ?? 0.005;
}

/**
 * The visibility formula shared with the trend chart: volume-weighted,
 * CTR-weighted share of click potential captured (0–100). Null when no
 * entry carries volume.
 */
export function computeVisibilityScore(
  entries: Array<{ searchVolume: number | null; position: number | null }>,
): number | null {
  let numerator = 0;
  let volume = 0;
  for (const entry of entries) {
    if (entry.searchVolume != null && entry.searchVolume > 0) {
      volume += entry.searchVolume;
      numerator += entry.searchVolume * ctr(entry.position);
    }
  }
  return volume > 0 ? (numerator / (volume * TOP_CTR)) * 100 : null;
}

interface Scorecards {
  /**
   * Volume-weighted, CTR-weighted share of click potential captured (0–100):
   * Σ(volume × CTR@position) ÷ Σ(volume × CTR@1). null if no volume data.
   */
  visibility: number | null;
  /** change in visibility (percentage points) vs the comparison period */
  visibilityDelta: number | null;
  /** keywords currently ranking (found within the tracked depth) */
  ranking: number;
  /** change in ranking-keyword count vs the comparison period */
  rankingDelta: number;
  top3: number;
  top10: number;
  improved: number;
  declined: number;
  /** ranked in both periods at the same position */
  unchanged: number;
}

/**
 * Portfolio scorecards from the already-loaded latest results for one device.
 * `ranking` counts keywords found within the tracked depth (a non-null
 * position) — unlike an average, it correctly drops when keywords fall out.
 * Improved/declined use the same 4-case null rules as DeviceRankCell: a "new"
 * entry counts as improved, a "lost" ranking counts as declined, and we never
 * subtract through a null.
 */
export function computeScorecards(
  rows: RankTrackingRow[],
  device: "desktop" | "mobile",
): Scorecards {
  let countCurrent = 0;
  let countPrevious = 0;
  let top3 = 0;
  let top10 = 0;
  let improved = 0;
  let declined = 0;
  let unchanged = 0;
  let visNumCurrent = 0;
  let visNumPrevious = 0;
  let visVolume = 0; // Σ volume over keywords with known volume

  for (const row of rows) {
    const { position, previousPosition } = row[device];

    if (position !== null) {
      countCurrent += 1;
      if (position <= 3) top3 += 1;
      if (position <= 10) top10 += 1;
    }
    if (previousPosition !== null) {
      countPrevious += 1;
    }

    if (row.searchVolume != null && row.searchVolume > 0) {
      visVolume += row.searchVolume;
      visNumCurrent += row.searchVolume * ctr(position);
      visNumPrevious += row.searchVolume * ctr(previousPosition);
    }

    // 4-case change classification (mirrors DeviceRankCell)
    if (position === null && previousPosition === null) {
      // nothing tracked — neither improved nor declined
    } else if (position === null) {
      declined += 1; // was ranking, now lost
    } else if (previousPosition === null) {
      improved += 1; // new entry
    } else if (previousPosition - position > 0) {
      improved += 1; // moved up
    } else if (previousPosition - position < 0) {
      declined += 1; // moved down
    } else {
      unchanged += 1; // ranked in both periods, same position
    }
  }

  const visibility =
    visVolume > 0 ? (visNumCurrent / (visVolume * TOP_CTR)) * 100 : null;
  const visibilityPrevious =
    visVolume > 0 ? (visNumPrevious / (visVolume * TOP_CTR)) * 100 : null;

  return {
    visibility,
    visibilityDelta:
      visibility !== null && visibilityPrevious !== null
        ? visibility - visibilityPrevious
        : null,
    ranking: countCurrent,
    rankingDelta: countCurrent - countPrevious,
    top3,
    top10,
    improved,
    declined,
    unchanged,
  };
}

type BucketTransition = {
  label: string;
  previous: number;
  current: number;
};

/**
 * Ubersuggest-style "current search rankings" read: how many keywords sat in
 * each position bucket previously vs now. Buckets are cumulative-exclusive
 * (Top 3, 4–10, 11–20, not ranking within the tracked depth).
 */
export function computeBucketTransitions(
  rows: RankTrackingRow[],
  device: "desktop" | "mobile",
): BucketTransition[] {
  const buckets = [
    { label: "Top 3", min: 1, max: 3 },
    { label: "Top 4–10", min: 4, max: 10 },
    { label: "Top 11–20", min: 11, max: 20 },
  ];

  const previous = [0, 0, 0, 0];
  const current = [0, 0, 0, 0];
  const bucketIndex = (position: number | null): number => {
    if (position == null) return 3;
    const index = buckets.findIndex(
      (bucket) => position >= bucket.min && position <= bucket.max,
    );
    return index === -1 ? 3 : index;
  };

  for (const row of rows) {
    previous[bucketIndex(row[device].previousPosition)] += 1;
    current[bucketIndex(row[device].position)] += 1;
  }

  return [
    ...buckets.map((bucket, index) => ({
      label: bucket.label,
      previous: previous[index],
      current: current[index],
    })),
    { label: "Not ranking", previous: previous[3], current: current[3] },
  ];
}
