import { describe, expect, it } from "vitest";
import {
  buildBandRows,
  describeMovement,
  type RankTrackingConfigRead,
} from "./rankTrackingSheet";

/**
 * What one sheet says about movement and about the position bands.
 *
 * This module holds no server-function import at runtime — the digest type is
 * imported as a type and erased — so it needs none of the stubbing the chapter
 * builder's own test does next door, in rankTracking.test.ts.
 *
 * This chapter is printed and handed to a client, so the interesting assertion
 * is never "the block is missing" — it is which sentence it prints instead. A
 * read that threw must never print as "nothing moved".
 */

type Digest = NonNullable<RankTrackingConfigRead["digest"]>;
type Mover = Digest["improved"][number];

function row(
  keyword: string,
  position: number | null,
  previousPosition: number | null,
  searchVolume: number | null = 100,
) {
  const desktop = {
    position,
    previousPosition,
    rankingUrl: null,
    serpFeatures: [],
  };
  return {
    trackingKeywordId: keyword,
    keyword,
    searchVolume,
    keywordDifficulty: null,
    cpc: null,
    desktop,
    mobile: { ...desktop },
  };
}

function mover(
  keyword: string,
  previousPosition: number | null,
  currentPosition: number | null,
): Mover {
  const delta =
    previousPosition != null && currentPosition != null
      ? previousPosition - currentPosition
      : null;
  return {
    keyword,
    searchVolume: 100,
    previousPosition,
    currentPosition,
    delta,
  };
}

function digest(overrides: Partial<Digest> = {}): Digest {
  return {
    configId: "config-1",
    domain: "example.com",
    latestRunAt: "2026-08-04 09:00:00",
    improved: [],
    declined: [],
    added: [],
    lost: [],
    improvedCount: 0,
    declinedCount: 0,
    addedCount: 0,
    lostCount: 0,
    ...overrides,
  };
}

function config(
  overrides: Partial<RankTrackingConfigRead> = {},
): RankTrackingConfigRead {
  return {
    configId: "config-1",
    locationLabel: "United States",
    device: "desktop",
    serpDepth: 40,
    keywordCount: 3,
    lastRunCompletedAt: "2026-08-04 09:00:00",
    lastRunStatus: "completed",
    lastSkipReason: null,
    rows: [row("blue widgets", 4, 7), row("red widgets", 12, 12)],
    rowsError: false,
    rowsPending: false,
    digest: digest({
      improved: [mover("blue widgets", 7, 4)],
      improvedCount: 1,
    }),
    ...overrides,
  };
}

/**
 * Every case below printed a confident falsehood over the agency's own work
 * before it was fixed, so each one pins the sentence that must NOT appear as
 * well as the one that must.
 */
const reads = { moversError: false, moversPending: false };

describe("movement, which the digest cannot always answer", () => {
  it("never tells a mobile-only tracker that nothing moved", () => {
    // The digest diffs desktop snapshots only, and a mobile-only tracker never
    // writes one — so its digest is empty however much its keywords moved.
    const block = describeMovement(config({ device: "mobile" }), reads);
    expect(block).toEqual({
      kind: "note",
      subtitle: null,
      text: "Position changes are compared on desktop results, and this tracker checks United States on mobile only, so no movement comparison is available for it.",
    });
    expect(block.kind === "note" && block.text).not.toContain(
      "No position changes are on record",
    );
  });

  it("reports keywords that entered and dropped out as the movement they are", () => {
    const block = describeMovement(
      config({
        digest: digest({
          added: [mover("green widgets", null, 6)],
          lost: [mover("grey widgets", 9, null)],
          addedCount: 1,
          lostCount: 1,
        }),
      }),
      reads,
    );
    expect(block.kind).toBe("note");
    expect(block.kind === "note" && block.text).toBe(
      "1 keyword entered the results and 1 keyword dropped out of them over the same period. No keyword that ranked in both checks changed position.",
    );
    expect(block.kind === "note" && block.text).not.toContain(
      "No position changes are on record",
    );
  });

  it("does not claim a second check is missing when it cannot know", () => {
    const block = describeMovement(config({ digest: digest() }), reads);
    expect(block.kind === "note" && block.text).toBe(
      "No position changes are on record for these keywords: either nothing moved between the two most recent checks, or only one check has completed so far and there is nothing yet to compare.",
    );
    expect(block.kind === "note" && block.text).not.toContain(
      "Comparisons appear once a second check has completed",
    );
    // With no comparison behind it, the subtitle's "two most recent completed
    // checks" would be the same unearned claim.
    expect(block.subtitle).toBeNull();
  });

  it("says plainly when no full check has completed", () => {
    const block = describeMovement(
      config({ digest: digest({ latestRunAt: null }) }),
      reads,
    );
    expect(block.kind === "note" && block.text).toBe(
      "No check covering all of these keywords has completed yet, so there are no position changes to compare.",
    );
  });

  it("reports the true totals when the table is capped", () => {
    const improved = Array.from({ length: 12 }, (_, index) =>
      mover(`up ${index}`, 20, 4),
    );
    const declined = Array.from({ length: 9 }, (_, index) =>
      mover(`down ${index}`, 4, 20),
    );
    const block = describeMovement(
      config({
        digest: digest({
          improved,
          declined,
          improvedCount: improved.length,
          declinedCount: declined.length,
        }),
      }),
      reads,
    );
    expect(block.kind).toBe("table");
    // 8 + 5 rows printed, 21 movers found: the cap must not read as a finding.
    expect(block.kind === "table" && block.movers).toHaveLength(13);
    expect(block.kind === "table" && block.footnote).toBe(
      "12 keywords improved and 9 keywords declined between these two checks; the table lists the 8 largest gains and the 5 largest drops.",
    );
  });

  it("dates the later of the two compared checks, not the baseline", () => {
    const block = describeMovement(config(), reads);
    expect(block.subtitle).toMatch(
      /^Movement between the two most recent completed checks, the later of which completed on .*2026.*\. This is a different comparison window from the figures above\.$/,
    );
    expect(block.subtitle).not.toContain(
      "since the check immediately before the latest one",
    );
  });

  it("keeps a failed digest read out of the movement claim", () => {
    const block = describeMovement(config({ digest: null }), {
      moversError: true,
      moversPending: false,
    });
    expect(block.kind === "note" && block.text).toBe(
      "The rank change summary could not be read while this report was generated — that request failed rather than returning nothing.",
    );
  });
});

describe("the position bands", () => {
  it("never calls a keyword the tile counts as ranking 'Not ranking'", () => {
    // Depth 40, keywords at 22 and 34: both are counted by "Ranking keywords".
    const { rows, note } = buildBandRows(
      config({
        serpDepth: 40,
        rows: [row("deep one", 34, 30), row("deep two", 22, null)],
      }),
    );
    const labels = rows.map((band) => band.cells[0]);
    expect(labels).toEqual([
      "Top 3",
      "Top 4–10",
      "Top 11–20",
      "Not in the top 20",
    ]);
    expect(labels).not.toContain("Not ranking");
    expect(rows[3].cells[2]).toBe(2);
    expect(note).toBe(
      " These bands stop at position 20 while this tracker checks to position 40, so a keyword ranked 21–40 counts as ranking in the figures above and sits in the last row here.",
    );
  });

  it("adds no band note when the tracker is no deeper than the bands", () => {
    expect(buildBandRows(config({ serpDepth: 10 })).note).toBe("");
  });

  it("prints no band deeper than the tracker checked", () => {
    // serpDepth is min(10).max(100).multipleOf(10) and the config modal's first
    // option is "1 page (top 10 results)", so this is an ordinary tracker. A
    // printed "Top 11–20" row could only ever read 0 → 0 here, which a client
    // reads as a check that came back empty rather than one never made.
    const { rows, note } = buildBandRows(
      config({
        serpDepth: 10,
        rows: [row("shallow one", 2, 5), row("shallow two", null, 9)],
      }),
    );
    const labels = rows.map((band) => band.cells[0]);
    expect(labels).toEqual(["Top 3", "Top 4–10", "Not in the top 10"]);
    expect(labels).not.toContain("Top 11–20");
    // The row labels keywords by the depth actually checked. "Not in the top
    // 20" would rank them against 10 positions nobody looked at.
    expect(labels).not.toContain("Not in the top 20");
    // Nothing is silently lost with the band: both columns still account for
    // every keyword checked (2 in, 2 out).
    const previous = rows.reduce(
      (total, band) => total + Number(band.cells[1]),
      0,
    );
    const current = rows.reduce(
      (total, band) => total + Number(band.cells[2]),
      0,
    );
    expect([previous, current]).toEqual([2, 2]);
    // "shallow one" moved 5 → 2, "shallow two" fell out of the top 10.
    expect(rows[2].cells).toEqual(["Not in the top 10", 0, 1]);
    // Nothing is hidden either: bands and depth agree, so there is no gap to
    // disclose — the branch that left this empty while printing a 20 was the
    // whole defect.
    expect(note).toBe("");
  });

  it("keeps all three bands when the tracker checks to exactly the band limit", () => {
    const { rows, note } = buildBandRows(config({ serpDepth: 20 }));
    expect(rows.map((band) => band.cells[0])).toEqual([
      "Top 3",
      "Top 4–10",
      "Top 11–20",
      "Not in the top 20",
    ]);
    expect(note).toBe("");
  });
});
