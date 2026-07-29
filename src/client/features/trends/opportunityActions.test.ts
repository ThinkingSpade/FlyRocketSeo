import { describe, expect, it } from "vitest";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import {
  buildTrendingOpportunities,
  isActionable,
  opportunityActionLabel,
  type OpportunityCandidate,
} from "./opportunityActions";
import { computeQueryMomentum, type QueryMomentum } from "./queryMomentum";

/**
 * Builds momentum through the REAL `computeQueryMomentum` rather than by hand.
 *
 * Hand-built fixtures let this suite pass against a broken momentum model --
 * an earlier version manufactured `page` from `position` and so could never
 * produce the ranks-but-unattributed state that caused a live defect.
 */
function momentumFor(impressions: number, prevImpressions: number | null) {
  const [row] = computeQueryMomentum({
    current: [{ query: "k", impressions }],
    previous:
      prevImpressions === null
        ? []
        : [{ query: "k", impressions: prevImpressions }],
    previousTruncated: false,
  });
  return row;
}

function candidate(
  keyword: string,
  position: number,
  impressions: number,
  prevImpressions: number | null,
  options: { page?: string | null; pageShare?: number | null } = {},
): OpportunityCandidate {
  const page = options.page === undefined ? "https://x.test/p" : options.page;
  return {
    keyword,
    momentum: { ...momentumFor(impressions, prevImpressions), query: keyword },
    position,
    page,
    pageShare: options.pageShare ?? (page === null ? null : 0.9),
  };
}

const directionOf = (m: QueryMomentum) => m.direction;

const NO_FIT = new Map<string, FitResult>();
const build = (
  candidates: OpportunityCandidate[],
  fit: ReadonlyMap<string, FitResult> = NO_FIT,
) => buildTrendingOpportunities({ candidates, fit });

const rising = (position: number, page?: string | null) =>
  candidate("k", position, 300, 100, page === undefined ? {} : { page });

describe("action from position", () => {
  it("defends inside the top 3", () => {
    expect(build([rising(2)])[0].action).toBe("defend");
  });

  it("fixes in striking distance", () => {
    const [row] = build([rising(7)]);
    expect(row.action).toBe("fix");
    expect(row.reason).toContain("#7");
  });

  it("expands in the second-page band", () => {
    expect(build([rising(15)])[0].action).toBe("expand");
  });

  it("rebuilds past position 20", () => {
    const [row] = build([rising(45)]);
    expect(row.action).toBe("rebuild");
    expect(row.reason).toContain("Rebuild the page that ranks");
  });

  it("uses the band boundaries inclusively", () => {
    const at = (position: number) => build([rising(position)])[0].action;
    expect(at(3)).toBe("defend");
    expect(at(4)).toBe("fix");
    expect(at(10)).toBe("fix");
    expect(at(11)).toBe("expand");
    expect(at(20)).toBe("expand");
    expect(at(21)).toBe("rebuild");
  });

  it("NEVER tells the user they have no page, even when attribution is missing", () => {
    // The live defect: the query x page call is truncated independently, so a
    // query that plainly ranks can come back with page: null. Concluding "no
    // page ranks for this" from that told users to write a duplicate.
    const [row] = build([rising(30, null)]);
    expect(row.page).toBeNull();
    expect(row.action).toBe("rebuild");
    expect(row.reason).not.toMatch(/no page/i);
  });
});

describe("split ownership", () => {
  it("changes the ACTION when no page owns the query, not just the wording", () => {
    // Rendering "Fix this page" beside a reason saying the pages compete is
    // two contradictory instructions in one row.
    const [row] = build([candidate("k", 7, 300, 100, { pageShare: 0.35 })]);
    expect(row.action).toBe("consolidate");
    expect(row.reason).toContain("split this query");
  });

  it("leaves a clearly-owned query alone", () => {
    expect(
      build([candidate("k", 7, 300, 100, { pageShare: 0.95 })])[0].action,
    ).toBe("fix");
  });

  it("does not claim a split when attribution is simply missing", () => {
    expect(build([rising(7, null)])[0].action).toBe("fix");
  });
});

describe("momentum handling", () => {
  it("tells the user to INVESTIGATE a decline rather than skipping it", () => {
    const [row] = build([candidate("k", 5, 100, 400)]);
    expect(row.action).toBe("investigate");
    expect(row.reason).toContain("ranking or indexing loss");
  });

  it("watches an unreadable signal rather than recommending anything", () => {
    // Below the impression floor.
    expect(build([candidate("k", 5, 4, 2)])[0].action).toBe("watch");
  });

  it("acts normally when there is no earlier figure to compare", () => {
    expect(build([candidate("k", 8, 300, null)])[0].action).toBe("fix");
  });
});

describe("scoring", () => {
  it("ranks by what is AT STAKE, so a big decline outranks a small rise", () => {
    // The concrete case the old formula got wrong: 1,000 (down from 10,000)
    // scored 900 and lost to 700 (up from 467) at 1,050.
    const rows = build([
      candidate("collapsed", 8, 1000, 10000),
      candidate("small-rise", 8, 700, 467),
    ]);
    expect(rows[0].keyword).toBe("collapsed");
  });

  it("has no cliff at the dead-band edge", () => {
    // 120 vs 121 against a baseline of 100 straddles flat/rising. Under the
    // old categorical multiplier that one impression moved the score 51%.
    const [flat] = build([candidate("k", 8, 120, 100)]);
    const [risen] = build([candidate("k", 8, 121, 100)]);
    const jump = Math.abs(risen.score - flat.score) / flat.score;
    expect(jump).toBeLessThan(0.1);
  });

  it("does not let a huge percentage on a tiny keyword outrank a real one", () => {
    const rows = build([
      candidate("big", 8, 5000, 5000),
      candidate("tiny", 8, 30, 1),
    ]);
    expect(rows[0].keyword).toBe("big");
  });

  it("sorts unreadable rows to the bottom", () => {
    const rows = build([
      candidate("unreadable", 5, 4, 2),
      candidate("real", 5, 50, 40),
    ]);
    expect(rows[0].keyword).toBe("real");
  });
});

describe("fit filtering", () => {
  it("DROPS a wrong-customer keyword entirely", () => {
    const fit = new Map<string, FitResult>([
      [
        "vending machines for sale",
        { verdict: "wrong-customer", reason: "you don't sell machines" },
      ],
    ]);
    const rows = build(
      [
        candidate("vending machines for sale", 8, 5000, 1000),
        candidate("office coffee service", 8, 300, 100),
      ],
      fit,
    );
    expect(rows.map((row) => row.keyword)).toEqual(["office coffee service"]);
  });

  it("keeps on-offer and adjacent keywords", () => {
    const fit = new Map<string, FitResult>([
      ["a", { verdict: "on-offer", reason: "" }],
      ["b", { verdict: "adjacent", reason: "" }],
    ]);
    expect(
      build([candidate("a", 5, 300, 100), candidate("b", 5, 300, 100)], fit),
    ).toHaveLength(2);
  });

  it("filters nothing when there is no profile", () => {
    expect(build([rising(5)])).toHaveLength(1);
  });
});

describe("isActionable", () => {
  it("excludes only the non-recommendation", () => {
    expect(isActionable(build([candidate("k", 5, 4, 2)])[0])).toBe(false);
    expect(isActionable(build([candidate("k", 5, 100, 400)])[0])).toBe(true);
    expect(isActionable(build([rising(5)])[0])).toBe(true);
  });
});

describe("opportunityActionLabel", () => {
  it("reads as an instruction", () => {
    expect(opportunityActionLabel("fix")).toBe("Fix this page");
    expect(opportunityActionLabel("rebuild")).toBe("Rebuild this page");
    expect(opportunityActionLabel("consolidate")).toBe(
      "Sort out competing pages",
    );
  });
});

describe("momentum fixture sanity", () => {
  it("the helper really does drive the production momentum model", () => {
    // Guards the guard: if computeQueryMomentum were stubbed or bypassed,
    // these directions would not track its thresholds.
    expect(directionOf(momentumFor(300, 100))).toBe("rising");
    expect(directionOf(momentumFor(100, 400))).toBe("falling");
    expect(directionOf(momentumFor(105, 100))).toBe("flat");
    expect(directionOf(momentumFor(300, null))).toBe("no-baseline");
    expect(directionOf(momentumFor(4, 2))).toBe("unknown");
  });
});
