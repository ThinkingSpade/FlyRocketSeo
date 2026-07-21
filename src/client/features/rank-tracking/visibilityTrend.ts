import type { RankPositionMatrixCell } from "@/serverFunctions/rank-tracking";
import { computeVisibilityScore } from "./rankTrackingScorecards";

// Pure replay of the visibility score across historical runs (no I/O),
// split out so the grouping rules are unit-testable.

type VisibilityTrendPoint = {
  runId: string;
  checkedAt: string;
  /** 0–100 visibility for that run, or null when no tracked volume. */
  visibility: number | null;
};

type AveragePositionPoint = {
  runId: string;
  checkedAt: string;
  /** Mean position across keywords ranked in that run, or null. */
  averagePosition: number | null;
  /** How many keywords were ranked (found in the SERP) that run. */
  rankedCount: number;
};

/**
 * Average position per stored run, over the keywords that ranked that run —
 * the Ubersuggest headline chart. Oldest first.
 */
export function computeAveragePositionTrend(
  cells: RankPositionMatrixCell[],
): AveragePositionPoint[] {
  const runs = new Map<
    string,
    { checkedAt: string; sum: number; count: number }
  >();
  for (const cell of cells) {
    const run = runs.get(cell.runId) ?? {
      checkedAt: cell.checkedAt,
      sum: 0,
      count: 0,
    };
    if (cell.position != null) {
      run.sum += cell.position;
      run.count += 1;
    }
    runs.set(cell.runId, run);
  }

  return [...runs.entries()]
    .map(([runId, run]) => ({
      runId,
      checkedAt: run.checkedAt,
      averagePosition: run.count > 0 ? run.sum / run.count : null,
      rankedCount: run.count,
    }))
    .toSorted((a, b) => a.checkedAt.localeCompare(b.checkedAt));
}

/**
 * Replay the scorecard's visibility formula over every run in the history
 * matrix. Keywords without a known volume are ignored (same rule as the
 * scorecard); keywords missing from a run count as not ranking. Points come
 * back oldest-first.
 */
export function computeVisibilityTrend(
  cells: RankPositionMatrixCell[],
  volumeByKeywordId: Map<string, number | null>,
): VisibilityTrendPoint[] {
  const runs = new Map<
    string,
    { checkedAt: string; positionByKeyword: Map<string, number | null> }
  >();
  for (const cell of cells) {
    const run = runs.get(cell.runId) ?? {
      checkedAt: cell.checkedAt,
      positionByKeyword: new Map<string, number | null>(),
    };
    run.positionByKeyword.set(cell.trackingKeywordId, cell.position);
    runs.set(cell.runId, run);
  }

  const trackedIds = [...volumeByKeywordId.keys()];

  return [...runs.entries()]
    .map(([runId, run]) => ({
      runId,
      checkedAt: run.checkedAt,
      visibility: computeVisibilityScore(
        trackedIds.map((keywordId) => ({
          searchVolume: volumeByKeywordId.get(keywordId) ?? null,
          position: run.positionByKeyword.get(keywordId) ?? null,
        })),
      ),
    }))
    .toSorted((a, b) => a.checkedAt.localeCompare(b.checkedAt));
}
