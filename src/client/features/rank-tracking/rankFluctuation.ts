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
  /** null = checked but not found within the config's tracked depth -- a
   *  real result, not a missing measurement. (app.schema.ts's own comment
   *  says "top 20", but serpDepth is actually configurable per config,
   *  10-100 and defaulting to 40 -- see RankTrackingConfigModal.tsx /
   *  clampSerpDepth in serp.ts -- so this model takes the real depth as a
   *  parameter rather than repeating that stale "20".) */
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
   * crossed the tracked-depth boundary, but not by how much, and inventing a
   * number here would be a claim the snapshots can't back up.
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
    /** In-range moves only (a real position both times, shifted by
     *  SIGNIFICANT_MOVE_THRESHOLD+) -- boundary crossings are deliberately
     *  excluded and counted separately below. Lumping them in here would
     *  claim a specific magnitude ("5+") for a move we can only bound, not
     *  measure (see enteredCount's doc). */
    upCount: number;
    downCount: number;
    /** Crossed INTO the tracked depth this check (previous run had no real
     *  position, latest run does). Always a real, meaningful move -- see the
     *  module doc -- but never folded into upCount, because we know it
     *  crossed the boundary, not by how much. */
    enteredCount: number;
    /** Crossed OUT of the tracked depth this check -- the down-direction
     *  mirror of enteredCount, same reasoning. */
    leftCount: number;
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

/** Wording shared by every verdict sentence for what counts as a real move:
 *  a big enough in-range shift, or crossing the tracked-depth boundary
 *  entirely. `trackedDepth` is the caller's actual configured serpDepth
 *  (10-100), never a hardcoded number -- see RankFluctuationSnapshot's doc
 *  on why "top 20" isn't safe to assume. */
function significanceCriteria(trackedDepth: number): string {
  return `${SIGNIFICANT_MOVE_THRESHOLD}+ places, or in/out of the top ${trackedDepth} entirely`;
}

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
  // null -> null: still outside the tracked depth both times. Nothing
  // changed, and this must never be counted as movement.
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
 * by crossing the tracked-depth boundary (e.g. leaving from #18 of a 20-deep
 * config must be a drop of at least 3), which is true even though the exact
 * drop isn't knowable.
 */
function sortMagnitude(
  movement: KeywordMovement,
  trackedDepth: number,
): number {
  if (movement.delta != null) return Math.abs(movement.delta);
  const boundary = trackedDepth + 1; // one past the tracked depth
  if (movement.direction === "entered" && movement.currentPosition != null) {
    return boundary - movement.currentPosition;
  }
  if (movement.direction === "left" && movement.previousPosition != null) {
    return boundary - movement.previousPosition;
  }
  return 0;
}

/** Biggest move first; ties broken alphabetically for a deterministic,
 *  testable order. */
function rankMovers(
  movements: KeywordMovement[],
  trackedDepth: number,
): KeywordMovement[] {
  return movements.toSorted((a, b) => {
    const magnitudeDiff =
      sortMagnitude(b, trackedDepth) - sortMagnitude(a, trackedDepth);
    return magnitudeDiff !== 0
      ? magnitudeDiff
      : a.keyword.localeCompare(b.keyword);
  });
}

/** Crossing the tracked-depth boundary is inherently meaningful regardless
 *  of magnitude (see the module doc on 18->null); an in-range move only
 *  counts once it clears SIGNIFICANT_MOVE_THRESHOLD. */
function isSignificant(movement: KeywordMovement): boolean {
  if (movement.direction === "entered" || movement.direction === "left") {
    return true;
  }
  return (
    movement.delta != null &&
    Math.abs(movement.delta) >= SIGNIFICANT_MOVE_THRESHOLD
  );
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
    breadth: {
      trackedCount: 0,
      upCount: 0,
      downCount: 0,
      enteredCount: 0,
      leftCount: 0,
      pattern: "none",
    },
  };
}

/** Shared input for broadVerdict/isolatedVerdict -- bundled as one object
 *  (rather than five positional params) so both the function signatures and
 *  their call sites in buildBreadthVerdict stay one-liners. */
interface MovementReadInput {
  direction: "up" | "down";
  count: number;
  trackedCount: number;
  /** The PREVIOUS run's date, not the latest -- see the doc below on why the
   *  window is dated from its start (finding 7). */
  previousDateLabel: string;
  criteria: string;
}

/**
 * The sentence shared by broadVerdict and isolatedVerdict: a count, a
 * comparison to the rest of the tracked set, dated from when the window
 * *started* -- never a claim about where the cause lies.
 *
 * Two honesty rules baked in here, both regression-tested (see the
 * "never asserts a cause" describe block in the test file):
 *
 * 1. Dated from the PREVIOUS run, not the latest one. Snapshots on Jul 1 and
 *    Jul 8 describe movement that happened *between* those two checks --
 *    "since Jul 8" would misdate it as starting when we finished measuring
 *    it, not when the window began.
 * 2. "The other N didn't move {direction} by that much" -- not "held
 *    steady". The keywords excluded from `count` only failed to clear
 *    SIGNIFICANT_MOVE_THRESHOLD *in this direction*; some may still have
 *    drifted a few places, or moved the other way. This phrasing is true
 *    either way, which "steady" is not.
 *
 * Deliberately silent on WHY count keywords moved together or alone -- that
 * a move is broad or isolated is visible from the fraction itself, so the
 * sentence reports the count and lets the reader draw the inference (see
 * the module doc).
 */
function movementRead(input: MovementReadInput): string {
  const { direction, count, trackedCount, previousDateLabel, criteria } = input;
  const rest = trackedCount - count;
  return (
    `${count} of ${trackedCount} keywords moved ${direction} significantly ` +
    `(${criteria}) since the previous check on ${previousDateLabel}; the ` +
    `other ${rest} didn't move ${direction} by that much.`
  );
}

function broadVerdict(input: MovementReadInput): Verdict {
  const { direction, count, trackedCount, previousDateLabel } = input;
  return {
    read: movementRead(input),
    // A broad decline is the headline risk here; a broad improvement is
    // good news, not something to flag as a problem.
    tone: direction === "down" ? "bad" : "good",
    actions:
      direction === "down"
        ? [
            {
              label: "Review the keywords that moved down together",
              evidence: `${count} of ${trackedCount} tracked keywords moved down together since the previous check on ${previousDateLabel}`,
              weight: 100,
            },
          ]
        : [],
  };
}

function isolatedVerdict(input: MovementReadInput): Verdict {
  const { direction, count, trackedCount } = input;
  return {
    read: movementRead(input),
    // An isolated decline is worth a look; an isolated gain on an
    // otherwise-flat set is simply good news for that one keyword.
    tone: direction === "down" ? "mixed" : "good",
    actions:
      direction === "down"
        ? [
            {
              label: `Review the ${count === 1 ? "keyword" : "keywords"} that moved down`,
              evidence: `${count} of ${trackedCount} tracked keywords moved down; the other ${trackedCount - count} didn't move down by that much`,
              weight: 80,
            },
          ]
        : [],
  };
}

function mixedVerdict(
  upCount: number,
  downCount: number,
  previousDateLabel: string,
  criteria: string,
): Verdict {
  return {
    read:
      `${upCount} keyword${upCount === 1 ? "" : "s"} moved up and ${downCount} ` +
      `moved down significantly (${criteria}) since the previous check on ` +
      `${previousDateLabel}, with neither direction standing out.`,
    tone: "mixed",
    actions: [],
  };
}

function noneVerdict(
  trackedCount: number,
  previousDateLabel: string,
  criteria: string,
): Verdict {
  return {
    read: `None of the ${trackedCount} tracked keywords moved significantly (${criteria}) since the previous check on ${previousDateLabel}.`,
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

/** Bundles the breadth-verdict inputs that would otherwise be five separate
 *  parameters, to stay under the project's max-params lint limit. */
interface BreadthContext {
  upCount: number;
  downCount: number;
  trackedCount: number;
  /** The PREVIOUS run's date, not the latest -- see movementRead's doc on
   *  why the window is dated from its start. */
  previousDateLabel: string;
  criteria: string;
}

function buildBreadthVerdict(
  pattern: BreadthPattern,
  context: BreadthContext,
): Verdict {
  const { upCount, downCount, trackedCount, previousDateLabel, criteria } =
    context;
  const shared = { trackedCount, previousDateLabel, criteria };
  switch (pattern) {
    case "none":
      return noneVerdict(trackedCount, previousDateLabel, criteria);
    case "broad-down":
      return broadVerdict({ direction: "down", count: downCount, ...shared });
    case "broad-up":
      return broadVerdict({ direction: "up", count: upCount, ...shared });
    case "isolated-down":
      return isolatedVerdict({
        direction: "down",
        count: downCount,
        ...shared,
      });
    case "isolated-up":
      return isolatedVerdict({ direction: "up", count: upCount, ...shared });
    case "mixed":
      return mixedVerdict(upCount, downCount, previousDateLabel, criteria);
    default:
      return assertNeverPattern(pattern);
  }
}

/**
 * Compares the latest completed run against the previous one for a single
 * device (the caller picks which device's snapshots to pass in -- see the
 * module doc) and classifies the breadth of movement across the tracked
 * keyword set.
 *
 * `trackedDepth` must be the config's actual serpDepth: it defines both what
 * "entered"/"left" means (crossing that exact boundary) and the wording of
 * the verdict, so a wrong value here would misdescribe the data.
 */
export function buildRankFluctuationVerdict(
  snapshots: RankFluctuationSnapshot[],
  trackedDepth: number,
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
  const movers = rankMovers(movements, trackedDepth);

  if (trackedCount < MIN_TRACKED_FOR_BREADTH_CLAIM) {
    return {
      verdict: unknownVerdict(
        `Only ${trackedCount} tracked keyword${trackedCount === 1 ? "" : "s"} ` +
          `${trackedCount === 1 ? "has" : "have"} comparable data across the ` +
          `last two checks -- too few to tell an isolated move from a ` +
          `site-wide pattern (need at least ${MIN_TRACKED_FOR_BREADTH_CLAIM}).`,
      ),
      movers,
      breadth: {
        trackedCount,
        upCount: 0,
        downCount: 0,
        enteredCount: 0,
        leftCount: 0,
        pattern: "none",
      },
    };
  }

  const significant = movements.filter(isSignificant);
  // Boundary crossings counted on their own -- see the breadth type's doc on
  // why they never join upCount/downCount (finding 9: we know they crossed,
  // not by how much, so lumping them into a "5+" count would misstate them).
  const countDirection = (direction: MovementDirection) =>
    significant.filter((movement) => movement.direction === direction).length;
  const enteredCount = countDirection("entered");
  const leftCount = countDirection("left");
  const upCount = countDirection("up");
  const downCount = countDirection("down");
  // The verdict prose and the breadth pattern both describe "a real move"
  // more broadly than the tile counts do -- criteria() already hedges this
  // ("5+ places, OR in/out of the tracked depth"), so boundary crossings
  // fold back in here even though they're reported separately above.
  const totalUpCount = upCount + enteredCount;
  const totalDownCount = downCount + leftCount;
  const pattern = classifyBreadth(totalUpCount, totalDownCount, trackedCount);
  // Dated from the start of the comparison window (the previous run), not
  // the latest one -- see movementRead's doc (finding 7: "since Jul 8" would
  // misdate movement that happened before Jul 8 as starting there).
  const previousDateLabel = formatCheckedDate(previousRun.checkedAt);
  const criteria = significanceCriteria(trackedDepth);

  return {
    verdict: buildBreadthVerdict(pattern, {
      upCount: totalUpCount,
      downCount: totalDownCount,
      trackedCount,
      previousDateLabel,
      criteria,
    }),
    movers,
    breadth: {
      trackedCount,
      upCount,
      downCount,
      enteredCount,
      leftCount,
      pattern,
    },
  };
}

/**
 * Formats a mover's position change for the "biggest movers" list. Crossing
 * the tracked-depth boundary reads as "outside the top N" -- matching what
 * `position: null` actually means (see RankFluctuationSnapshot's doc) --
 * never "Not ranking", which claims more than a search this shallow can
 * support: the business could easily still rank, just past the configured
 * depth. `trackedDepth` must be the same config value passed to
 * buildRankFluctuationVerdict (10-100, never a hardcoded 20 or 40 -- see the
 * module doc on why "top 20" isn't safe to assume).
 */
export function describeTransition(
  movement: KeywordMovement,
  trackedDepth: number,
): string {
  const { direction, previousPosition, currentPosition, delta } = movement;
  const outsideDepth = `Outside top ${trackedDepth}`;
  if (direction === "entered") return `${outsideDepth} → #${currentPosition}`;
  if (direction === "left") return `#${previousPosition} → ${outsideDepth}`;
  if (delta == null) return `#${previousPosition} → #${currentPosition}`;
  const sign = delta > 0 ? "+" : "";
  return `#${previousPosition} → #${currentPosition} (${sign}${delta})`;
}

/**
 * Short, at-a-glance label per breadth pattern for RankFluctuationCard's
 * headline tile -- the full reasoning (with exact counts) lives in the
 * verdict sentence below it (movementRead/noneVerdict above).
 *
 * Finding A8: "none" used to read "Steady", but "none" only means no
 * keyword individually crossed SIGNIFICANT_MOVE_THRESHOLD (5+ places) or a
 * tracked-depth boundary -- it does NOT mean nothing moved. Ten or more
 * keywords could all shift four places in the same direction (below the
 * per-keyword significance bar) and this pattern would still be "none",
 * even though noneVerdict's own sentence correctly says "moved
 * significantly", never "steady" or "unchanged". "Steady" as a headline
 * overclaimed stillness the detail sentence never asserted. "No
 * significant moves" mirrors that same qualifier and is equally true
 * whether nothing moved at all or everything moved by a uniform,
 * sub-threshold amount.
 */
export const BREADTH_PATTERN_LABEL: Record<BreadthPattern, string> = {
  none: "No significant moves",
  "broad-down": "Broad drop",
  "broad-up": "Broad gain",
  "isolated-down": "Isolated drop",
  "isolated-up": "Isolated gain",
  mixed: "Mixed",
};
