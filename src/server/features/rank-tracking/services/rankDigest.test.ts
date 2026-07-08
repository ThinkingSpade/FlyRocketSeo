import { describe, expect, it, vi } from "vitest";

// The pure function under test lives alongside the service, which transitively
// imports the provider-aware `@/db` (and thus the `cloudflare:workers` runtime).
// Stub it so importing this module in the node test env doesn't try to open a
// real database — mirrors RankTrackingService.test.ts.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { computeRankDigest } from "./rankDigest";

function positions(
  entries: Array<[string, number | null]>,
): Map<string, number | null> {
  return new Map(entries);
}

describe("computeRankDigest", () => {
  it("classifies improved / declined by delta sign", () => {
    const previous = positions([
      ["up", 5],
      ["down", 4],
      ["flat", 7],
    ]);
    const latest = positions([
      ["up", 2], // 5 -> 2, moved up
      ["down", 8], // 4 -> 8, moved down
      ["flat", 7], // unchanged -> ignored
    ]);

    const digest = computeRankDigest(previous, latest);

    expect(digest.improvedCount).toBe(1);
    expect(digest.declinedCount).toBe(1);
    expect(digest.improved[0].keyword).toBe("up");
    expect(digest.improved[0].delta).toBe(3); // previous - current = 5 - 2
    expect(digest.declined[0].keyword).toBe("down");
    expect(digest.declined[0].delta).toBe(-4); // 4 - 8
  });

  it("classifies added (was absent/null) and lost (now absent/null)", () => {
    const previous = positions([
      ["absent-before", null], // explicit null previous
      ["lost", 3],
    ]);
    const latest = positions([
      ["absent-before", 9], // null -> ranked => added
      ["brand-new", 4], // key absent in previous => added
      ["lost", null], // 3 -> null => lost
    ]);

    const digest = computeRankDigest(previous, latest);

    expect(digest.addedCount).toBe(2);
    expect(digest.lostCount).toBe(1);
    expect(digest.added.map((m) => m.keyword).toSorted()).toEqual([
      "absent-before",
      "brand-new",
    ]);
    expect(digest.lost[0].keyword).toBe("lost");
    // added/lost never subtract through a missing side
    expect(digest.added.every((m) => m.delta === null)).toBe(true);
    expect(digest.lost.every((m) => m.delta === null)).toBe(true);
  });

  it("sorts improved by largest positive delta and declined by largest drop", () => {
    const previous = positions([
      ["small-up", 4],
      ["big-up", 20],
      ["small-down", 3],
      ["big-down", 2],
    ]);
    const latest = positions([
      ["small-up", 3], // +1
      ["big-up", 5], // +15
      ["small-down", 5], // -2
      ["big-down", 18], // -16
    ]);

    const digest = computeRankDigest(previous, latest);

    expect(digest.improved.map((m) => m.keyword)).toEqual([
      "big-up",
      "small-up",
    ]);
    expect(digest.declined.map((m) => m.keyword)).toEqual([
      "big-down",
      "small-down",
    ]);
  });

  it("sorts added / lost by search volume descending, nulls last", () => {
    const previous = positions([
      ["lost-hi", 2],
      ["lost-lo", 2],
    ]);
    const latest = positions([
      ["added-hi", 5],
      ["added-lo", 5],
      ["added-null", 5],
      ["lost-hi", null],
      ["lost-lo", null],
    ]);
    const searchVolume = new Map<string, number | null>([
      ["added-hi", 900],
      ["added-lo", 100],
      ["added-null", null],
      ["lost-hi", 900],
      ["lost-lo", 100],
    ]);

    const digest = computeRankDigest(previous, latest, { searchVolume });

    expect(digest.added.map((m) => m.keyword)).toEqual([
      "added-hi",
      "added-lo",
      "added-null",
    ]);
    expect(digest.lost.map((m) => m.keyword)).toEqual(["lost-hi", "lost-lo"]);
    expect(digest.added[0].searchVolume).toBe(900);
  });

  it("returns an empty digest for identical runs", () => {
    const same = positions([
      ["a", 1],
      ["b", null],
      ["c", 12],
    ]);

    const digest = computeRankDigest(same, new Map(same));

    expect(digest).toMatchObject({
      improvedCount: 0,
      declinedCount: 0,
      addedCount: 0,
      lostCount: 0,
    });
    expect(digest.improved).toHaveLength(0);
    expect(digest.declined).toHaveLength(0);
    expect(digest.added).toHaveLength(0);
    expect(digest.lost).toHaveLength(0);
  });

  it("returns an empty digest when both runs are empty", () => {
    const digest = computeRankDigest(new Map(), new Map());
    expect(digest.improvedCount + digest.declinedCount).toBe(0);
    expect(digest.addedCount + digest.lostCount).toBe(0);
  });
});
