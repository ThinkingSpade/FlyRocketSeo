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
