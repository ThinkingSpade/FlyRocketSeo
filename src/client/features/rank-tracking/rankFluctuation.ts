import type { Verdict } from "@/client/features/insights/types";
import { unknownVerdict } from "@/client/features/insights/types";

/**
 * Reads a config's rank-check history for the one thing a per-keyword
 * position table doesn't say: whether today's movement is a page-level
 * story or a site-wide one. A single keyword sliding ten places is either
 * ordinary SERP churn or a page-specific problem (bad content, a lost link,
 * a competitor outranking it). A large share of the tracked set moving
 * together, in the same direction, on the same check is something else --
 * and the two deserve a different reaction.
 *
 * Deliberately silent on cause. This module can only ever say what the
 * snapshots show: counts, directions, positions. It must never say *why* --
 * naming a specific cause (an algorithm update, a competitor's move,
 * anything Google did) is not something a position table can support, and
 * must never appear in generated text here.
 *
 * Scoped to one device per call, matching every other pure model in this
 * feature (computeScorecards, computeVisibilityTrend in
 * rankTrackingScorecards.ts / visibilityTrend.ts): the caller already loads
 * position data one device at a time, and mixing desktop with mobile
 * movement into a single count would blur two independently meaningful
 * signals into one that means neither.
 */

/**
 * One rank_snapshots row, narrowed to the fields this model needs (see
 * src/db/app.schema.ts). Defined locally rather than imported from a
 * server-function return type, so this module depends only on the shape of
 * the snapshot data itself, not on any particular query's projection.
 */
export interface RankFluctuationSnapshot {
  runId: string;
  checkedAt: string;
  trackingKeywordId: string;
  keyword: string;
  /** null = checked but not found in the top 20 -- a real result, not a
   *  missing measurement. See the rank_snapshots comment in app.schema.ts. */
  position: number | null;
}

export type MovementDirection = "up" | "down" | "flat" | "entered" | "left";

export interface KeywordMovement {
  trackingKeywordId: string;
  keyword: string;
  previousPosition: number | null;
  currentPosition: number | null;
  direction: MovementDirection;
  /**
   * Positions gained (positive) or lost (negative), only when both runs have
   * a real position. Null for "entered"/"left": the keyword is known to have
   * crossed the top-20 boundary, but not by how much, and inventing a number
   * here would be a claim the snapshots can't back up.
   */
  delta: number | null;
}

export type BreadthPattern =
  | "none"
  | "broad-down"
  | "broad-up"
  | "isolated-down"
  | "isolated-up"
  | "mixed";

export interface RankFluctuationResult {
  verdict: Verdict;
  /** Every keyword with a snapshot in both the latest and previous run,
   *  biggest move first (see rankMovers). Includes flat keywords too -- they
   *  simply sort to the bottom -- so the UI can decide how many to show. */
  movers: KeywordMovement[];
  breadth: {
    /** Keywords compared (present in both runs) -- the denominator behind
     *  every share below and the basis for the minimum-keywords guard. */
    trackedCount: number;
    upCount: number;
    downCount: number;
    pattern: BreadthPattern;
  };
}

// Need at least a "previous" and a "latest" run to compare anything.
const MIN_RUNS_FOR_COMPARISON = 2;

// A couple of positions of drift is ordinary SERP noise -- personalization,
// timing, Google-side testing -- even when nothing about the page changed.
// Five is comfortably outside that band, so a keyword flagged here is very
// likely a real move, not measurement jitter.
const SIGNIFICANT_MOVE_THRESHOLD = 5;

// Below this many comparable keywords, a couple of ordinary noisy keywords
// are already a large share of the set (3 of 5 is 60%), so calling anything
// "broad" would just be describing normal variance as if it were a pattern.
// Ten is the smallest set where a majority moving together stops being
// plausible as pure chance.
const MIN_TRACKED_FOR_BREADTH_CLAIM = 10;

// Past this share of the tracked set moving the same direction, coincidence
// stops being a plausible explanation for all of them -- see the module
// doc's isolated-vs-broad distinction.
const BROAD_MOVEMENT_SHARE = 0.3;

// If the smaller direction's significant movers are at least this fraction
// of the larger direction's, neither direction dominates -- the set reads as
// mixed rather than "broad" in whichever direction happens to have slightly
// more movers.
const MIXED_MINORITY_SHARE = 0.35;

// position: null means "not found in the top 20" (see RankFluctuationSnapshot
// above) -- one past that is the boundary a keyword must cross to flip
// between a real position and null.
const TRACKED_DEPTH = 20;

const SIGNIFICANCE_CRITERIA = `${SIGNIFICANT_MOVE_THRESHOLD}+ places, or in/out of the top 20 entirely`;

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Formats a stored checkedAt ("YYYY-MM-DD HH:MM:SS", always UTC -- see
 * toSqliteTimestamp) as "Mon D" without constructing a Date, so the result
 * never shifts with the runtime's local timezone. Falls back to the raw
 * string if it isn't shaped as expected, rather than throwing.
 */
function formatCheckedDate(checkedAt: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(checkedAt);
  if (!match) return checkedAt;
  const month = MONTH_ABBREVIATIONS[Number(match[2]) - 1];
  if (!month) return checkedAt;
  return `${month} ${Number(match[3])}`;
}

interface RunGroup {
  runId: string;
  checkedAt: string;
  positions: Map<string, { position: number | null; keyword: string }>;
}

/** Groups snapshots by run, oldest first (mirrors the sort used throughout
 *  this feature, e.g. visibilityTrend.ts's computeVisibilityTrend). */
function groupByRun(snapshots: RankFluctuationSnapshot[]): RunGroup[] {
  const runs = new Map<string, RunGroup>();
  for (const snapshot of snapshots) {
    let run = runs.get(snapshot.runId);
    if (!run) {
      run = {
        runId: snapshot.runId,
        checkedAt: snapshot.checkedAt,
        positions: new Map(),
      };
      runs.set(snapshot.runId, run);
    }
    run.positions.set(snapshot.trackingKeywordId, {
      position: snapshot.position,
      keyword: snapshot.keyword,
    });
  }
  return [...runs.values()].toSorted((a, b) =>
    a.checkedAt.localeCompare(b.checkedAt),
  );
}

function classifyDirection(
  previous: number | null,
  current: number | null,
): MovementDirection {
  // null -> null: still not found in the top 20 both times. Nothing changed,
  // and this must never be counted as movement.
  if (previous == null && current == null) return "flat";
  if (previous == null) return "entered";
  if (current == null) return "left";
  if (current < previous) return "up"; // lower position number = better rank
  if (current > previous) return "down";
  return "flat";
}

/** Compares two runs per keyword. Only keywords with a snapshot row in BOTH
 *  runs are included -- one missing entirely (not just position: null) means
 *  it wasn't tracked at that point, not that it moved, so there is nothing
 *  honest to say about it. */
function buildMovements(
  previousRun: RunGroup,
  latestRun: RunGroup,
): KeywordMovement[] {
  const movements: KeywordMovement[] = [];
  for (const [trackingKeywordId, previous] of previousRun.positions) {
    const current = latestRun.positions.get(trackingKeywordId);
    if (!current) continue;
    const direction = classifyDirection(previous.position, current.position);
    const delta =
      previous.position != null && current.position != null
        ? previous.position - current.position
        : null;
    movements.push({
      trackingKeywordId,
      keyword: current.keyword,
      previousPosition: previous.position,
      currentPosition: current.position,
      direction,
      delta,
    });
  }
  return movements;
}

/**
 * Lower-bound movement size, used only to order movers -- never surfaced as
 * a claimed number. For "entered"/"left" this is the minimum distance implied
 * by crossing the top-20 boundary (e.g. leaving from #18 must be a drop of
 * at least 3), which is true even though the exact drop isn't knowable.
 */
function sortMagnitude(movement: KeywordMovement): number {
  if (movement.delta != null) return Math.abs(movement.delta);
  if (movement.direction === "entered" && movement.currentPosition != null) {
    return TRACKED_DEPTH + 1 - movement.currentPosition;
  }
  if (movement.direction === "left" && movement.previousPosition != null) {
    return TRACKED_DEPTH + 1 - movement.previousPosition;
  }
  return 0;
}

/** Biggest move first; ties broken alphabetically for a deterministic,
 *  testable order. */
function rankMovers(movements: KeywordMovement[]): KeywordMovement[] {
  return movements.toSorted((a, b) => {
    const magnitudeDiff = sortMagnitude(b) - sortMagnitude(a);
    return magnitudeDiff !== 0
      ? magnitudeDiff
      : a.keyword.localeCompare(b.keyword);
  });
}

/** Crossing the top-20 boundary is inherently meaningful regardless of
 *  magnitude (see the module doc on 18->null); an in-range move only counts
 *  once it clears SIGNIFICANT_MOVE_THRESHOLD. */
function isSignificant(movement: KeywordMovement): boolean {
  if (movement.direction === "entered" || movement.direction === "left") {
    return true;
  }
  return (
    movement.delta != null &&
    Math.abs(movement.delta) >= SIGNIFICANT_MOVE_THRESHOLD
  );
}

function isUpward(movement: KeywordMovement): boolean {
  return movement.direction === "up" || movement.direction === "entered";
}

function classifyBreadth(
  upCount: number,
  downCount: number,
  trackedCount: number,
): BreadthPattern {
  const totalSignificant = upCount + downCount;
  if (totalSignificant === 0) return "none";

  const larger = Math.max(upCount, downCount);
  const smaller = Math.min(upCount, downCount);
  if (smaller > 0 && smaller / larger >= MIXED_MINORITY_SHARE) return "mixed";

  const broad = larger / trackedCount >= BROAD_MOVEMENT_SHARE;
  const dominantIsUp = upCount >= downCount;
  if (dominantIsUp) return broad ? "broad-up" : "isolated-up";
  return broad ? "broad-down" : "isolated-down";
}

function emptyResult(verdict: Verdict): RankFluctuationResult {
  return {
    verdict,
    movers: [],
    breadth: { trackedCount: 0, upCount: 0, downCount: 0, pattern: "none" },
  };
}

function broadVerdict(
  direction: "up" | "down",
  count: number,
  trackedCount: number,
  dateLabel: string,
): Verdict {
  const read =
    `${count} of ${trackedCount} keywords moved ${direction} significantly ` +
    `(${SIGNIFICANCE_CRITERIA}) since ${dateLabel} -- movement this broad ` +
    `usually points to something site-wide rather than any one page.`;
  return {
    read,
    // A broad decline is the headline risk here; a broad improvement is
    // good news, not something to flag as a problem.
    tone: direction === "down" ? "bad" : "good",
    actions:
      direction === "down"
        ? [
            {
              label: "Review site-wide changes rather than any single page",
              evidence: `${count} of ${trackedCount} tracked keywords moved down together since ${dateLabel}`,
              weight: 100,
            },
          ]
        : [],
  };
}

function isolatedVerdict(
  direction: "up" | "down",
  count: number,
  trackedCount: number,
  dateLabel: string,
): Verdict {
  const read =
    `${count} of ${trackedCount} keywords moved ${direction} significantly ` +
    `(${SIGNIFICANCE_CRITERIA}) since ${dateLabel}, with the rest holding ` +
    `steady -- a move this isolated usually traces back to that specific ` +
    `page rather than anything site-wide.`;
  return {
    read,
    // An isolated decline is worth a page-level look; an isolated gain on
    // an otherwise-flat set is simply good news for that one keyword.
    tone: direction === "down" ? "mixed" : "good",
    actions:
      direction === "down"
        ? [
            {
              label: "Check the page behind the drop for a page-level cause",
              evidence: `${count} of ${trackedCount} tracked keywords moved down; the rest held steady`,
              weight: 80,
            },
          ]
        : [],
  };
}

function mixedVerdict(
  upCount: number,
  downCount: number,
  dateLabel: string,
): Verdict {
  return {
    read:
      `${upCount} keyword${upCount === 1 ? "" : "s"} moved up and ${downCount} ` +
      `moved down significantly (${SIGNIFICANCE_CRITERIA}) since ${dateLabel}, ` +
      `with neither direction standing out -- this doesn't read as one ` +
      `site-wide event.`,
    tone: "mixed",
    actions: [],
  };
}

function noneVerdict(trackedCount: number, dateLabel: string): Verdict {
  return {
    read: `None of the ${trackedCount} tracked keywords moved significantly (${SIGNIFICANCE_CRITERIA}) since ${dateLabel}.`,
    tone: "good",
    actions: [],
  };
}

/** Exhaustiveness guard: TypeScript proves `pattern` is `never` here only if
 *  every BreadthPattern case above is handled, so adding a new pattern
 *  without a branch fails to compile instead of silently falling through. */
function assertNeverPattern(pattern: never): never {
  throw new Error(`Unhandled breadth pattern: ${String(pattern)}`);
}

function buildBreadthVerdict(
  pattern: BreadthPattern,
  upCount: number,
  downCount: number,
  trackedCount: number,
  dateLabel: string,
): Verdict {
  switch (pattern) {
    case "none":
      return noneVerdict(trackedCount, dateLabel);
    case "broad-down":
      return broadVerdict("down", downCount, trackedCount, dateLabel);
    case "broad-up":
      return broadVerdict("up", upCount, trackedCount, dateLabel);
    case "isolated-down":
      return isolatedVerdict("down", downCount, trackedCount, dateLabel);
    case "isolated-up":
      return isolatedVerdict("up", upCount, trackedCount, dateLabel);
    case "mixed":
      return mixedVerdict(upCount, downCount, dateLabel);
    default:
      return assertNeverPattern(pattern);
  }
}

/**
 * Compares the latest completed run against the previous one for a single
 * device (the caller picks which device's snapshots to pass in -- see the
 * module doc) and classifies the breadth of movement across the tracked
 * keyword set.
 */
export function buildRankFluctuationVerdict(
  snapshots: RankFluctuationSnapshot[],
): RankFluctuationResult {
  const runs = groupByRun(snapshots);

  if (runs.length < MIN_RUNS_FOR_COMPARISON) {
    return emptyResult(
      unknownVerdict(
        runs.length === 0
          ? "No rank checks have completed yet, so there is nothing to compare."
          : "Only one completed check is on record -- at least two are needed before movement can be compared.",
      ),
    );
  }

  const previousRun = runs[runs.length - 2];
  const latestRun = runs[runs.length - 1];
  const movements = buildMovements(previousRun, latestRun);
  const trackedCount = movements.length;
  const movers = rankMovers(movements);

  if (trackedCount < MIN_TRACKED_FOR_BREADTH_CLAIM) {
    return {
      verdict: unknownVerdict(
        `Only ${trackedCount} tracked keyword${trackedCount === 1 ? "" : "s"} ` +
          `${trackedCount === 1 ? "has" : "have"} comparable data across the ` +
          `last two checks -- too few to tell an isolated move from a ` +
          `site-wide pattern (need at least ${MIN_TRACKED_FOR_BREADTH_CLAIM}).`,
      ),
      movers,
      breadth: { trackedCount, upCount: 0, downCount: 0, pattern: "none" },
    };
  }

  const significant = movements.filter(isSignificant);
  const upCount = significant.filter(isUpward).length;
  const downCount = significant.length - upCount;
  const pattern = classifyBreadth(upCount, downCount, trackedCount);
  const dateLabel = formatCheckedDate(latestRun.checkedAt);

  return {
    verdict: buildBreadthVerdict(
      pattern,
      upCount,
      downCount,
      trackedCount,
      dateLabel,
    ),
    movers,
    breadth: { trackedCount, upCount, downCount, pattern },
  };
}
