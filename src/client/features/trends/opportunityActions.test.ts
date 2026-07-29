import { describe, expect, it } from "vitest";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import {
  buildTrendingOpportunities,
  isActionable,
  opportunityActionLabel,
  type OpportunityCandidate,
} from "./opportunityActions";
import type { MomentumDirection, QueryMomentum } from "./queryMomentum";

function momentum(
  direction: MomentumDirection,
  impressions: number,
): QueryMomentum {
  const hasNumber = direction === "rising" || direction === "falling";
  return {
    query: "k",
    impressions,
    prevImpressions: direction === "no-baseline" ? null : 100,
    percent: hasNumber ? (direction === "rising" ? 50 : -50) : null,
    direction,
  };
}

function candidate(
  keyword: string,
  direction: MomentumDirection,
  position: number | null,
  impressions = 200,
  options: { hasPage?: boolean; pageShare?: number | null } = {},
): OpportunityCandidate {
  const hasPage = options.hasPage ?? position !== null;
  return {
    keyword,
    momentum: { ...momentum(direction, impressions), query: keyword },
    position,
    page: hasPage ? "https://deliotx.com/services" : null,
    pageShare: options.pageShare ?? (hasPage ? 0.9 : null),
  };
}

const NO_FIT = new Map<string, FitResult>();
const build = (
  candidates: OpportunityCandidate[],
  fit: ReadonlyMap<string, FitResult> = NO_FIT,
) => buildTrendingOpportunities({ candidates, fit });

describe("action from position", () => {
  it("defends inside the top 3", () => {
    expect(build([candidate("a", "rising", 2)])[0].action).toBe("defend");
  });

  it("fixes in striking distance", () => {
    const [row] = build([candidate("a", "rising", 7)]);
    expect(row.action).toBe("fix");
    expect(row.reason).toContain("#7");
  });

  it("expands in the second-page band", () => {
    expect(build([candidate("a", "rising", 15)])[0].action).toBe("expand");
  });

  it("REBUILDS rather than writing a second page when one already ranks", () => {
    // Position 40 still means a page of theirs ranks. Telling them to write
    // another invites two of their own pages competing for the same query.
    const [row] = build([candidate("a", "rising", 45)]);
    expect(row.action).toBe("rebuild");
    expect(row.reason).toContain("rather than adding a second one");
  });

  it("writes a new page only when nothing of theirs ranks", () => {
    const [row] = build([
      candidate("a", "rising", null, 200, { hasPage: false }),
    ]);
    expect(row.action).toBe("write-new");
    expect(row.reason).toBe("You have no page ranking for this yet.");
  });

  it("uses the band boundaries inclusively", () => {
    const at = (position: number) =>
      build([candidate("a", "rising", position)])[0].action;
    expect(at(3)).toBe("defend");
    expect(at(4)).toBe("fix");
    expect(at(10)).toBe("fix");
    expect(at(11)).toBe("expand");
    expect(at(20)).toBe("expand");
    expect(at(21)).toBe("rebuild");
  });
});

describe("momentum handling", () => {
  it("tells the user to INVESTIGATE a decline, not to skip it", () => {
    // A ranking or indexing loss looks exactly like falling impressions, and
    // that is the most valuable case on the page -- not the least. Skipping
    // it would also directly contradict the Opportunities tab, which calls a
    // declining position-8 query a quick win.
    const [row] = build([candidate("a", "falling", 5)]);
    expect(row.action).toBe("investigate");
    expect(row.reason).toContain("ranking or indexing loss");
  });

  it("watches an unreadable signal rather than recommending anything", () => {
    expect(build([candidate("a", "unknown", 5)])[0].action).toBe("watch");
  });

  it("acts normally when there is no earlier figure to compare", () => {
    // Absence of a prior row is not evidence of novelty, so it must not get
    // its own special action -- just the position-appropriate one.
    expect(build([candidate("a", "no-baseline", 8)])[0].action).toBe("fix");
  });

  it("still acts on steady impressions, ranked lower", () => {
    const rows = build([
      candidate("steady", "flat", 8, 1000),
      candidate("rising", "rising", 8, 1000),
    ]);
    expect(rows.map((row) => row.keyword)).toEqual(["rising", "steady"]);
    expect(rows[1].action).toBe("fix");
  });

  it("does not zero out a falling keyword's score", () => {
    // It still has impressions; a big declining keyword outranks a tiny
    // rising one.
    const rows = build([
      candidate("big-falling", "falling", 5, 5000),
      candidate("tiny-rising", "rising", 5, 100),
    ]);
    expect(rows[0].keyword).toBe("big-falling");
  });
});

describe("multi-page queries", () => {
  it("warns when no single page owns the impressions", () => {
    const [row] = build([
      candidate("a", "rising", 7, 200, { pageShare: 0.35 }),
    ]);
    expect(row.reason).toContain("competing");
  });

  it("stays quiet when one page clearly owns the query", () => {
    const [row] = build([
      candidate("a", "rising", 7, 200, { pageShare: 0.95 }),
    ]);
    expect(row.reason).not.toContain("competing");
  });
});

describe("ranking", () => {
  it("lets momentum break a near-tie", () => {
    const rows = build([
      candidate("steady-big", "flat", 8, 1000),
      candidate("rising-small", "rising", 8, 900),
    ]);
    expect(rows[0].keyword).toBe("rising-small");
  });

  it("does not let momentum rescue a trivial keyword", () => {
    const rows = build([
      candidate("big", "flat", 8, 5000),
      candidate("tiny", "rising", 8, 30),
    ]);
    expect(rows[0].keyword).toBe("big");
  });

  it("sorts unreadable rows to the bottom", () => {
    const rows = build([
      candidate("unknown", "unknown", 5, 9000),
      candidate("small-rising", "rising", 5, 50),
    ]);
    expect(rows[0].keyword).toBe("small-rising");
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
        candidate("vending machines for sale", "rising", 8, 5000),
        candidate("office coffee service", "rising", 8),
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
      build([candidate("a", "rising", 5), candidate("b", "rising", 5)], fit),
    ).toHaveLength(2);
  });

  it("filters nothing when there is no profile — an unfiltered list, not a falsely confident one", () => {
    expect(build([candidate("a", "rising", 5)])).toHaveLength(1);
  });
});

describe("isActionable", () => {
  it("excludes only the non-recommendation", () => {
    expect(isActionable(build([candidate("a", "unknown", 5)])[0])).toBe(false);
    expect(isActionable(build([candidate("a", "falling", 5)])[0])).toBe(true);
    expect(isActionable(build([candidate("a", "rising", 5)])[0])).toBe(true);
  });
});

describe("opportunityActionLabel", () => {
  it("reads as an instruction", () => {
    expect(opportunityActionLabel("fix")).toBe("Fix this page");
    expect(opportunityActionLabel("rebuild")).toBe("Rebuild this page");
    expect(opportunityActionLabel("investigate")).toBe("Find out what changed");
  });
});
