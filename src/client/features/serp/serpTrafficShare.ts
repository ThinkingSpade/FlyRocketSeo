// Pure CTR-curve math for the SERP traffic-share column (no I/O), split out
// so the estimates are unit-testable.

/**
 * Blended organic CTR by position, an industry-standard approximation
 * (top-heavy long-tail curve in the spirit of public CTR studies). Positions
 * beyond 20 round to zero clicks.
 */
const CTR_BY_POSITION: Record<number, number> = {
  1: 0.27,
  2: 0.15,
  3: 0.11,
  4: 0.08,
  5: 0.06,
  6: 0.05,
  7: 0.04,
  8: 0.03,
  9: 0.025,
  10: 0.02,
};

function ctrForPosition(position: number): number {
  if (position < 1) return 0;
  const exact = CTR_BY_POSITION[position];
  if (exact != null) return exact;
  return position <= 20 ? 0.01 : 0;
}

type TrafficShareEstimate = {
  /** Estimated monthly organic clicks for this result. */
  clicks: number;
  /** clicks relative to the best result in the set, 0..1 (for bars). */
  relative: number;
};

/**
 * Estimate monthly clicks per ranked result from the keyword's search volume
 * and each result's position. Returns null when volume is unknown; positions
 * missing a rank estimate to zero clicks.
 */
export function estimateTrafficShare(
  searchVolume: number | null | undefined,
  ranks: Array<number | null>,
): Map<number, TrafficShareEstimate> | null {
  if (searchVolume == null || searchVolume <= 0) return null;

  const clicksByRank = new Map<number, number>();
  for (const rank of ranks) {
    if (rank == null || clicksByRank.has(rank)) continue;
    clicksByRank.set(rank, Math.round(searchVolume * ctrForPosition(rank)));
  }

  const max = Math.max(0, ...clicksByRank.values());
  const estimates = new Map<number, TrafficShareEstimate>();
  for (const [rank, clicks] of clicksByRank) {
    estimates.set(rank, {
      clicks,
      relative: max > 0 ? clicks / max : 0,
    });
  }
  return estimates;
}
