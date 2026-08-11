import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleNotch,
  SignIn,
  SignOut,
  Waves,
} from "@phosphor-icons/react";
import {
  InsightIcon,
  InsightTile,
  type InsightTone,
} from "@/client/components/InsightTile";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import type { RankPositionMatrixCell } from "@/serverFunctions/rank-tracking";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  BREADTH_PATTERN_LABEL,
  buildRankFluctuationVerdict,
  describeTransition,
  type BreadthPattern,
  type KeywordMovement,
  type RankFluctuationResult,
} from "./rankFluctuation";

// Mirrors the verdict's own tone per pattern (see rankFluctuation.ts):
// broad-down is the one genuinely bad-news pattern, isolated-down and mixed
// are a caution, both "up" patterns and "none" are fine.
const PATTERN_TONE: Record<BreadthPattern, InsightTone> = {
  none: "neutral",
  "broad-down": "error",
  "broad-up": "success",
  "isolated-down": "warning",
  "isolated-up": "success",
  mixed: "warning",
};

// The model already ranks every comparable keyword biggest-first; the card
// only needs enough of that list to answer "what should I look at first".
const MAX_MOVERS_SHOWN = 5;

/**
 * Rank Fluctuation Monitor: tells an isolated, page-level rank drop apart
 * from a broad move across the tracked set. Pure presentation over data the
 * page already loaded -- `cells` and `rows` are the same position matrix and
 * result rows RankTrackingScoreboard/RankTrackingOverview already fetch, so
 * this component makes no query of its own (see rankFluctuation.ts's module
 * doc: no-auto-spend means this can only ever read history already in D1).
 */
export function RankFluctuationCard({
  cells,
  rows,
  serpDepth,
  projectId,
  isLoading,
}: {
  cells: RankPositionMatrixCell[];
  rows: RankTrackingRow[];
  /** The config's actual configured depth -- never assumed to be 20, see
   *  rankFluctuation.ts's doc on why that's unsafe. */
  serpDepth: number;
  projectId: string;
  isLoading: boolean;
}) {
  const result = useMemo<RankFluctuationResult | null>(() => {
    // While the matrix is still loading, `cells` is a transient empty array,
    // not a real "zero runs recorded" answer -- computing now would flash a
    // false "no rank checks have completed yet" before the real data lands.
    if (isLoading) return null;
    const keywordById = new Map(
      rows.map((row) => [row.trackingKeywordId, row.keyword]),
    );
    const snapshots = cells.map((cell) => ({
      ...cell,
      keyword:
        keywordById.get(cell.trackingKeywordId) ?? cell.trackingKeywordId,
    }));
    return buildRankFluctuationVerdict(snapshots, serpDepth);
  }, [cells, rows, serpDepth, isLoading]);

  if (!result) {
    return (
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center justify-center rounded-lg border border-base-300 bg-base-100 p-4">
          <CircleNotch className="size-4 animate-spin text-base-content/50" />
        </div>
      </div>
    );
  }

  const notableMovers = result.movers
    .filter((movement) => movement.direction !== "flat")
    .slice(0, MAX_MOVERS_SHOWN);

  return (
    <div className="space-y-3 px-4 pt-4 pb-4">
      {result.verdict.tone !== "unknown" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <InsightTile
            icon={Waves}
            label="Breadth"
            value={BREADTH_PATTERN_LABEL[result.breadth.pattern]}
            hint={`${result.breadth.trackedCount} keywords compared`}
            tone={PATTERN_TONE[result.breadth.pattern]}
          />
          <InsightTile
            icon={ArrowUpRight}
            label="Moved up 5+"
            value={result.breadth.upCount}
            tone={result.breadth.upCount > 0 ? "success" : "neutral"}
          />
          <InsightTile
            icon={ArrowDownRight}
            label="Moved down 5+"
            value={result.breadth.downCount}
            tone={result.breadth.downCount > 0 ? "error" : "neutral"}
          />
          {/* Boundary crossings get their own tiles rather than folding into
              the two above (finding 9): we know a keyword crossed in or out
              of the tracked depth, but not by how much, so counting it under
              "5+" would claim a magnitude the data doesn't support. Only
              shown when it actually happened, unlike the always-on pair
              above, since most checks have none. */}
          {result.breadth.enteredCount > 0 && (
            <InsightTile
              icon={SignIn}
              label={`Entered top ${serpDepth}`}
              value={result.breadth.enteredCount}
              tone="success"
            />
          )}
          {result.breadth.leftCount > 0 && (
            <InsightTile
              icon={SignOut}
              label={`Left top ${serpDepth}`}
              value={result.breadth.leftCount}
              tone="error"
            />
          )}
        </div>
      )}

      <NextStepsCard
        verdict={result.verdict}
        projectId={projectId}
        tab="Rank Tracking"
      />

      {notableMovers.length > 0 && (
        <div className="rounded-lg border border-base-300 bg-base-100 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <InsightIcon icon={Waves} tone="neutral" />
            Biggest movers
          </h3>
          <ul className="mt-2 divide-y divide-base-300">
            {notableMovers.map((movement) => (
              <MoverRow
                key={movement.trackingKeywordId}
                movement={movement}
                serpDepth={serpDepth}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MoverRow({
  movement,
  serpDepth,
}: {
  movement: KeywordMovement;
  /** Threaded through to describeTransition so a crossed-boundary row reads
   *  "Outside top {serpDepth}" using the config's real depth, not a
   *  hardcoded guess (finding 9). */
  serpDepth: number;
}) {
  const isUp = movement.direction === "up" || movement.direction === "entered";
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-1.5">
        <InsightIcon
          icon={isUp ? ArrowUpRight : ArrowDownRight}
          tone={isUp ? "success" : "error"}
        />
        <span className="truncate">{movement.keyword}</span>
      </span>
      <span className="shrink-0 text-xs text-base-content/60 tabular-nums">
        {describeTransition(movement, serpDepth)}
      </span>
    </li>
  );
}
