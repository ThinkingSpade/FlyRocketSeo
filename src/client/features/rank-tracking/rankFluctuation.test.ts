import { describe, expect, it } from "vitest";
import {
  buildRankFluctuationVerdict,
  type RankFluctuationSnapshot,
} from "./rankFluctuation";

const RUN_1 = "2026-07-01 09:00:00";
const RUN_2 = "2026-07-08 09:00:00";

// The config's configured serpDepth used throughout this suite. Chosen as a
// concrete, valid value (RankTrackingConfigModal allows 10-100) rather than
// assumed -- see rankFluctuation.ts's doc on why "top 20" is never hardcoded.
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

/**
 * Builds a two-run comparison: each `move` becomes a keyword tracked in both
 * runs, going from `previous` to `current`. `paddingCount` adds extra
 * keywords that stay flat (10 -> 10) purely to reach a tracked-set size,
 * without themselves contributing any movement -- so tests can isolate one
 * or two interesting keywords while still clearing the minimum-keywords
 * guard.
 */
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

describe("buildRankFluctuationVerdict", () => {
  it("returns unknown with no completed runs at all", () => {
    const result = buildRankFluctuationVerdict([], DEPTH);
    expect(result.verdict.tone).toBe("unknown");
    expect(result.verdict.read).toBe(
      "No rank checks have completed yet, so there is nothing to compare.",
    );
    expect(result.movers).toEqual([]);
    expect(result.breadth).toEqual({
      trackedCount: 0,
      upCount: 0,
      downCount: 0,
      pattern: "none",
    });
  });

  it("returns unknown with only one completed run", () => {
    const result = buildRankFluctuationVerdict(
      [snap("r1", RUN_1, "k1", 5)],
      DEPTH,
    );
    expect(result.verdict.tone).toBe("unknown");
    expect(result.verdict.read).toBe(
      "Only one completed check is on record -- at least two are needed before movement can be compared.",
    );
    expect(result.movers).toEqual([]);
  });

  it("treats null -> null as no movement, never counted as a mover", () => {
    // 12 keywords, every one null in both runs.
    const moves = Array.from({ length: 12 }, (_, i) => ({
      id: `k${i}`,
      previous: null,
      current: null,
    }));
    const result = buildRankFluctuationVerdict(buildSnapshots(moves), DEPTH);

    expect(result.breadth).toEqual({
      trackedCount: 12,
      upCount: 0,
      downCount: 0,
      pattern: "none",
    });
    expect(result.movers).toHaveLength(12);
    expect(result.movers.every((m) => m.direction === "flat")).toBe(true);
    expect(result.movers.every((m) => m.delta === null)).toBe(true);
    expect(result.verdict.tone).toBe("good");
  });

  it("classifies 18 -> null as leaving the tracked depth, without inventing a delta", () => {
    const result = buildRankFluctuationVerdict(
      buildSnapshots([{ id: "k1", previous: 18, current: null }], 9),
      DEPTH,
    );
    const mover = result.movers.find((m) => m.trackingKeywordId === "k1");
    expect(mover).toMatchObject({
      previousPosition: 18,
      currentPosition: null,
      direction: "left",
      delta: null,
    });
    // A boundary exit always counts toward breadth, regardless of the
    // 5-place threshold -- we don't know the true distance, only that it's
    // real and it's significant.
    expect(result.breadth.downCount).toBe(1);
  });

  it("classifies null -> 18 as entering the tracked depth, without inventing a delta", () => {
    const result = buildRankFluctuationVerdict(
      buildSnapshots([{ id: "k1", previous: null, current: 18 }], 9),
      DEPTH,
    );
    const mover = result.movers.find((m) => m.trackingKeywordId === "k1");
    expect(mover).toMatchObject({
      previousPosition: null,
      currentPosition: 18,
      direction: "entered",
      delta: null,
    });
    expect(result.breadth.upCount).toBe(1);
  });

  it("reports a broad synchronised drop as broad, with exact counts", () => {
    // 23 of 40 keywords drop 10 places; the rest hold flat.
    const dropping = Array.from({ length: 23 }, (_, i) => ({
      id: `drop${i}`,
      previous: 5,
      current: 15,
    }));
    const result = buildRankFluctuationVerdict(
      buildSnapshots(dropping, 17),
      DEPTH,
    );

    expect(result.breadth).toMatchObject({
      trackedCount: 40,
      upCount: 0,
      downCount: 23,
      pattern: "broad-down",
    });
    expect(result.verdict.tone).toBe("bad");
    expect(result.verdict.read).toBe(
      "23 of 40 keywords moved down significantly (5+ places, or in/out of the top 20 entirely) since Jul 8 -- movement this broad usually points to something site-wide rather than any one page.",
    );
    expect(result.verdict.actions).toEqual([
      {
        label: "Review site-wide changes rather than any single page",
        evidence: "23 of 40 tracked keywords moved down together since Jul 8",
        weight: 100,
      },
    ]);
  });

  it("reports an isolated large drop as isolated, not broad", () => {
    const result = buildRankFluctuationVerdict(
      buildSnapshots([{ id: "big-drop", previous: 3, current: 18 }], 39),
      DEPTH,
    );

    expect(result.breadth).toMatchObject({
      trackedCount: 40,
      upCount: 0,
      downCount: 1,
      pattern: "isolated-down",
    });
    expect(result.verdict.tone).toBe("mixed");
    expect(result.verdict.read).toBe(
      "1 of 40 keywords moved down significantly (5+ places, or in/out of the top 20 entirely) since Jul 8, with the rest holding steady -- a move this isolated usually traces back to that specific page rather than anything site-wide.",
    );
  });

  it("reports a mixed set with no clear direction", () => {
    const up = Array.from({ length: 8 }, (_, i) => ({
      id: `up${i}`,
      previous: 15,
      current: 5,
    }));
    const down = Array.from({ length: 10 }, (_, i) => ({
      id: `down${i}`,
      previous: 5,
      current: 15,
    }));
    const result = buildRankFluctuationVerdict(
      buildSnapshots([...up, ...down], 22),
      DEPTH,
    );

    expect(result.breadth).toMatchObject({
      trackedCount: 40,
      upCount: 8,
      downCount: 10,
      pattern: "mixed",
    });
    expect(result.verdict.tone).toBe("mixed");
    expect(result.verdict.read).toBe(
      "8 keywords moved up and 10 moved down significantly (5+ places, or in/out of the top 20 entirely) since Jul 8, with neither direction standing out -- this doesn't read as one site-wide event.",
    );
  });

  it("honors the minimum-keywords guard just below the floor", () => {
    // 9 comparable keywords -- one short of the floor.
    const moves = Array.from({ length: 9 }, (_, i) => ({
      id: `k${i}`,
      previous: 5,
      current: 15,
    }));
    const result = buildRankFluctuationVerdict(buildSnapshots(moves), DEPTH);

    expect(result.verdict.tone).toBe("unknown");
    expect(result.verdict.read).toBe(
      "Only 9 tracked keywords have comparable data across the last two checks -- too few to tell an isolated move from a site-wide pattern (need at least 10).",
    );
  });

  it("proceeds to a real verdict exactly at the minimum-keywords floor", () => {
    const moves = Array.from({ length: 10 }, (_, i) => ({
      id: `k${i}`,
      previous: 5,
      current: 15,
    }));
    const result = buildRankFluctuationVerdict(buildSnapshots(moves), DEPTH);

    expect(result.verdict.tone).not.toBe("unknown");
    expect(result.breadth.trackedCount).toBe(10);
  });

  it("returns unknown honestly for a two-keyword set", () => {
    const result = buildRankFluctuationVerdict(
      buildSnapshots([
        { id: "k1", previous: 5, current: 15 },
        { id: "k2", previous: 3, current: null },
      ]),
      DEPTH,
    );

    expect(result.verdict.tone).toBe("unknown");
    expect(result.verdict.read).toBe(
      "Only 2 tracked keywords have comparable data across the last two checks -- too few to tell an isolated move from a site-wide pattern (need at least 10).",
    );
  });

  it("ignores a keyword missing entirely from one run, rather than guessing", () => {
    // k-new only exists in the latest run (added after the previous check) --
    // it must not be treated as "entered" since we have no prior snapshot at
    // all to compare against, only an absent row.
    const snapshots = buildSnapshots(
      [{ id: "k1", previous: 5, current: 15 }],
      8,
    );
    snapshots.push(snap("r2", RUN_2, "k-new", 4));
    const result = buildRankFluctuationVerdict(snapshots, DEPTH);

    expect(
      result.movers.find((m) => m.trackingKeywordId === "k-new"),
    ).toBeUndefined();
    expect(result.breadth.trackedCount).toBe(9);
  });

  it("does not count a 4-place move as significant, but does count 5", () => {
    const result = buildRankFluctuationVerdict(
      buildSnapshots(
        [
          { id: "small", previous: 10, current: 6 }, // 4 places
          { id: "big", previous: 10, current: 5 }, // 5 places
        ],
        8,
      ),
      DEPTH,
    );

    expect(
      result.movers.find((m) => m.trackingKeywordId === "small"),
    ).toMatchObject({ direction: "up", delta: 4 });
    expect(
      result.movers.find((m) => m.trackingKeywordId === "big"),
    ).toMatchObject({ direction: "up", delta: 5 });
    expect(result.breadth.upCount).toBe(1);
  });

  it("ranks movers biggest-first, using a minimum bound for entered/left", () => {
    const result = buildRankFluctuationVerdict(
      buildSnapshots([
        { id: "small-up", previous: 12, current: 4 }, // delta 8
        { id: "left-from-5", previous: 5, current: null }, // >= 16 bound
        { id: "entered-at-3", previous: null, current: 3 }, // >= 18 bound
        { id: "small-down", previous: 10, current: 13 }, // delta -3
      ]),
      DEPTH,
    );

    expect(result.movers.map((m) => m.trackingKeywordId)).toEqual([
      "entered-at-3",
      "left-from-5",
      "small-up",
      "small-down",
    ]);
  });

  it("uses the caller's tracked depth for the minimum bound, not a hardcoded 20", () => {
    // Depth 40: leaving from #35 must have moved at least (41 - 35) = 6, and
    // should rank above a known move of 5 -- but would be a nonsensical
    // negative bound if depth were wrongly assumed to be 20.
    const result = buildRankFluctuationVerdict(
      buildSnapshots([
        { id: "left-from-35", previous: 35, current: null },
        { id: "known-move-5", previous: 10, current: 5 },
      ]),
      40,
    );

    expect(result.movers.map((m) => m.trackingKeywordId)).toEqual([
      "left-from-35",
      "known-move-5",
    ]);
  });

  it("names the caller's tracked depth in the verdict sentence", () => {
    const dropping = Array.from({ length: 23 }, (_, i) => ({
      id: `drop${i}`,
      previous: 5,
      current: 15,
    }));
    const result = buildRankFluctuationVerdict(
      buildSnapshots(dropping, 17),
      40,
    );
    expect(result.verdict.read).toContain("in/out of the top 40 entirely");
  });

  it("stays isolated one point below the broad-share floor, at the 10-keyword minimum", () => {
    // trackedCount is exactly the floor (10); 2 of 10 move down = 20%.
    const result = buildRankFluctuationVerdict(
      buildSnapshots(
        [
          { id: "d1", previous: 5, current: 15 },
          { id: "d2", previous: 5, current: 15 },
        ],
        8,
      ),
      DEPTH,
    );
    expect(result.breadth.pattern).toBe("isolated-down");
  });

  it("flips to broad exactly at the broad-share floor", () => {
    // 3 of 10 move down = 30%, the configured floor.
    const result = buildRankFluctuationVerdict(
      buildSnapshots(
        [
          { id: "d1", previous: 5, current: 15 },
          { id: "d2", previous: 5, current: 15 },
          { id: "d3", previous: 5, current: 15 },
        ],
        7,
      ),
      DEPTH,
    );
    expect(result.breadth.pattern).toBe("broad-down");
  });
});
