import { describe, expect, it } from "vitest";
import {
  buildRankFluctuationVerdict,
  describeTransition,
  type KeywordMovement,
  type RankFluctuationSnapshot,
} from "./rankFluctuation";

/**
 * Regression suite for the review findings that all shared one failure mode:
 * user-facing text claiming more than a position snapshot can support.
 * Split out from rankFluctuation.test.ts (which already covers the model's
 * comparison logic) so this file stays focused on the specific honesty
 * guarantees findings 6, 7, and 9 added:
 *
 * - Finding 6: no verdict sentence or action may assert a CAUSE (site-wide
 *   vs. page-level) -- a position table can only say what moved, not why.
 * - Finding 7: movement is dated from the PREVIOUS run (the start of the
 *   comparison window), not the latest one.
 * - Finding 9: a boundary crossing (null <-> a real position) is its own
 *   category, described as "outside the tracked depth" -- never folded into
 *   a "5+" count it can't actually support, never called "Not ranking".
 */

const RUN_1 = "2026-07-01 09:00:00";
const RUN_2 = "2026-07-08 09:00:00";
const DEPTH = 20;

function snap(
  runId: string,
  checkedAt: string,
  trackingKeywordId: string,
  position: number | null,
): RankFluctuationSnapshot {
  return {
    runId,
    checkedAt,
    trackingKeywordId,
    keyword: trackingKeywordId,
    position,
  };
}

// Mirrors rankFluctuation.test.ts's own buildSnapshots -- see that file's doc.
function buildSnapshots(
  moves: Array<{ id: string; previous: number | null; current: number | null }>,
  paddingCount = 0,
): RankFluctuationSnapshot[] {
  const snapshots: RankFluctuationSnapshot[] = [];
  for (const move of moves) {
    snapshots.push(snap("r1", RUN_1, move.id, move.previous));
    snapshots.push(snap("r2", RUN_2, move.id, move.current));
  }
  for (let i = 0; i < paddingCount; i++) {
    const id = `pad${i}`;
    snapshots.push(snap("r1", RUN_1, id, 10));
    snapshots.push(snap("r2", RUN_2, id, 10));
  }
  return snapshots;
}

// `count` significant up/down moves, prefixed so ids stay unique when two
// groups are combined in one buildSnapshots call (a mixed scenario needs both).
function upMoves(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    previous: 15,
    current: 5,
  }));
}

function downMoves(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    previous: 5,
    current: 15,
  }));
}

// A KeywordMovement with sensible defaults, for describeTransition cases that
// only care about a couple of fields.
function movement(overrides: Partial<KeywordMovement>): KeywordMovement {
  return {
    trackingKeywordId: "k1",
    keyword: "k1",
    previousPosition: null,
    currentPosition: null,
    direction: "flat",
    delta: null,
    ...overrides,
  };
}

describe("buildRankFluctuationVerdict dates movement from the previous run (finding 7)", () => {
  it("dates the verdict from the previous run's checkedAt, not the latest run's", () => {
    // RUN_1 (Jul 1) is the previous run, RUN_2 (Jul 8) the latest -- the
    // movement happened *between* them, so the window is dated from where
    // it started, not where it was last measured.
    const result = buildRankFluctuationVerdict(
      buildSnapshots(downMoves(23, "d"), 17),
      DEPTH,
    );

    expect(result.verdict.read).toContain("since the previous check on Jul 1");
    expect(result.verdict.read).not.toContain("Jul 8");
    expect(result.verdict.actions[0]?.evidence).toContain(
      "since the previous check on Jul 1",
    );
  });
});

describe("buildRankFluctuationVerdict never asserts a cause (finding 6 regression guard)", () => {
  // Any of these would tell the reader WHY keywords moved -- something a
  // position table can never establish (see rankFluctuation.ts's module
  // doc). This scans every breadth pattern's generated text, not just the
  // two sentences the original review happened to catch, so a causal claim
  // reintroduced anywhere in this module's output fails here first.
  const CAUSAL_PHRASES = [
    "traces back",
    "points to",
    "because",
    "due to",
    "site-wide",
    "page-level",
    "caused by",
    "responsible for",
  ];

  const flatMoves = Array.from({ length: 12 }, (_, i) => ({
    id: `flat${i}`,
    previous: null,
    current: null,
  }));

  const scenarios: Array<[string, RankFluctuationSnapshot[]]> = [
    ["broad-down", buildSnapshots(downMoves(23, "d"), 17)],
    ["broad-up", buildSnapshots(upMoves(23, "u"), 17)],
    ["isolated-down", buildSnapshots(downMoves(1, "d"), 39)],
    ["isolated-up", buildSnapshots(upMoves(1, "u"), 39)],
    ["mixed", buildSnapshots([...upMoves(8, "u"), ...downMoves(10, "d")], 22)],
    ["none", buildSnapshots(flatMoves)],
  ];

  it.each(scenarios)(
    "pattern %s contains no causal language",
    (_label, snapshots) => {
      const result = buildRankFluctuationVerdict(snapshots, DEPTH);
      const text = [
        result.verdict.read,
        ...result.verdict.actions.flatMap((a) => [a.label, a.evidence]),
      ]
        .join(" ")
        .toLowerCase();
      for (const phrase of CAUSAL_PHRASES) expect(text).not.toContain(phrase);
    },
  );
});

describe("describeTransition (finding 9)", () => {
  const cases: Array<[string, KeywordMovement, number, string]> = [
    [
      "an in-range move with its exact delta",
      movement({
        previousPosition: 10,
        currentPosition: 4,
        direction: "up",
        delta: 6,
      }),
      40,
      "#10 → #4 (+6)",
    ],
    [
      // The exact failing input from finding 9: at serpDepth 40, null -> 40.
      "entering the tracked depth",
      movement({ currentPosition: 40, direction: "entered" }),
      40,
      "Outside top 40 → #40",
    ],
    [
      "leaving the tracked depth",
      movement({ previousPosition: 18, direction: "left" }),
      20,
      "#18 → Outside top 20",
    ],
    [
      "a non-default depth, not a hardcoded 20 or 40",
      movement({ currentPosition: 73, direction: "entered" }),
      80,
      "Outside top 80 → #73",
    ],
  ];

  it.each(cases)("describes %s", (_label, input, trackedDepth, expected) => {
    const description = describeTransition(input, trackedDepth);
    expect(description).toBe(expected);
    expect(description).not.toContain("Not ranking");
  });
});

describe("buildRankFluctuationVerdict keeps boundary crossings out of the measured counts (finding 9)", () => {
  it("counts a null -> depth crossing as enteredCount, not upCount", () => {
    // The exact failing input from finding 9: at serpDepth 40, a keyword
    // goes null -> 40, plus nine flat keywords.
    const result = buildRankFluctuationVerdict(
      buildSnapshots([{ id: "k1", previous: null, current: 40 }], 9),
      40,
    );

    expect(result.breadth).toMatchObject({
      trackedCount: 10,
      upCount: 0,
      enteredCount: 1,
      leftCount: 0,
    });
  });
});
