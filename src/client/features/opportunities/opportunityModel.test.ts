import { describe, expect, it } from "vitest";
import {
  buildOpportunities,
  buildTechnicalIssues,
  quickWinClicks,
  quickWinHint,
  type Opportunity,
} from "./opportunityModel";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    kind: "quick-win",
    query: "a query",
    page: "https://x.com/a",
    position: 9,
    impressions: 500,
    clicksAtStake: 20,
    ...overrides,
  };
}

function auditPage(
  overrides: Partial<Parameters<typeof buildTechnicalIssues>[0][number]> = {},
) {
  return {
    url: "https://x.com/page",
    statusCode: 200,
    title: "A title",
    metaDescription: "A description",
    h1Count: 1,
    wordCount: 900,
    imagesMissingAlt: 0,
    ...overrides,
  };
}

describe("quickWinClicks", () => {
  it("estimates the lift from the current position up to the top 3", () => {
    // Position 8 earns ~3%; the top 3 earns ~11% → 8 points of 1,000 impr.
    expect(quickWinClicks(1000, 8)).toBe(80);
  });

  it("returns zero when the page already ranks at or above the target", () => {
    expect(quickWinClicks(1000, 1)).toBe(0);
    expect(quickWinClicks(1000, 3)).toBe(0);
  });
});

describe("buildOpportunities", () => {
  const input = {
    strikingDistance: [
      {
        query: "big quick win",
        page: "https://x.com/a",
        impressions: 2000,
        position: 9,
      },
      {
        query: "tiny",
        page: "https://x.com/tiny",
        impressions: 5,
        position: 19,
      },
    ],
    ctrOpportunities: [
      {
        query: "under-clicked",
        page: "https://x.com/b",
        impressions: 900,
        position: 2,
        missedClicks: 60,
      },
    ],
    cannibalization: [
      {
        query: "split query",
        totalImpressions: 1000,
        splitShare: 0.5,
        pages: [
          { page: "https://x.com/win", isWinner: true },
          { page: "https://x.com/lose", isWinner: false },
        ],
      },
    ],
  };

  it("ranks every signal on one clicks-at-stake axis", () => {
    const rows = buildOpportunities(input);

    // 2000 * (0.11 - 0.025) = 170 beats the 60 missed clicks.
    expect(rows[0]).toMatchObject({
      kind: "quick-win",
      query: "big quick win",
      clicksAtStake: 170,
    });
    expect(rows[1]).toMatchObject({ kind: "ctr", clicksAtStake: 60 });
    // 1000 * 0.5 * 0.3 * 0.11 = 16.5 → 17
    expect(rows[2]).toMatchObject({ kind: "consolidate", clicksAtStake: 17 });
  });

  it("drops sub-click noise so the list stays actionable", () => {
    const rows = buildOpportunities(input);
    expect(rows.some((row) => row.query === "tiny")).toBe(false);
  });

  it("points a consolidation at the winning page", () => {
    const rows = buildOpportunities(input);
    const consolidate = rows.find((row) => row.kind === "consolidate");
    expect(consolidate?.page).toBe("https://x.com/win");
    expect(consolidate?.detail).toContain("2 pages competing");
  });

  it("handles all-empty sources", () => {
    expect(
      buildOpportunities({
        strikingDistance: [],
        ctrOpportunities: [],
        cannibalization: [],
      }),
    ).toEqual([]);
  });
});

describe("buildOpportunities overlap", () => {
  // A row at position 8 with high impressions and no clicks legitimately
  // appears in BOTH striking distance and CTR opportunities. Both describe the
  // same impressions reaching the top three, so adding their estimates
  // overstates the headline "clicks at stake if all are fixed".
  const shared = {
    query: "widgets",
    page: "https://x.com/widgets",
    impressions: 1000,
    position: 8,
  };

  it("emits one opportunity per query and page, not one per signal", () => {
    const opportunities = buildOpportunities({
      strikingDistance: [shared],
      ctrOpportunities: [{ ...shared, missedClicks: 30 }],
      cannibalization: [],
    });

    const forRow = opportunities.filter(
      (item) => item.query === "widgets" && item.page === shared.page,
    );
    expect(forRow).toHaveLength(1);
  });

  it("takes the larger overlapping estimate rather than their sum", () => {
    const quickWin = quickWinClicks(1000, 8);
    const ctrGap = 30;

    const [merged] = buildOpportunities({
      strikingDistance: [shared],
      ctrOpportunities: [{ ...shared, missedClicks: ctrGap }],
      cannibalization: [],
    });

    expect(merged.clicksAtStake).toBe(Math.max(quickWin, ctrGap));
    expect(merged.clicksAtStake).toBeLessThan(quickWin + ctrGap);
  });

  it("mentions both signals so the merge is not silent", () => {
    const [merged] = buildOpportunities({
      strikingDistance: [shared],
      ctrOpportunities: [{ ...shared, missedClicks: 30 }],
      cannibalization: [],
    });

    expect(merged.detail).toMatch(/top 3/i);
    expect(merged.detail).toMatch(/under-clicked/i);
  });

  it("keeps consolidation separate from a quick win on the same page", () => {
    // Adversarial review caught this: merging by query+page swallowed the
    // consolidation row, and `kind` drives the badge AND the row's CTA. The user
    // was sent to "Build brief" for work that is actually about redirecting a
    // competing URL. Signal overlap is not task identity.
    const opportunities = buildOpportunities({
      strikingDistance: [
        {
          query: "widgets",
          page: "https://x.com/widgets",
          impressions: 600,
          position: 8,
        },
      ],
      ctrOpportunities: [],
      cannibalization: [
        {
          query: "widgets",
          totalImpressions: 1000,
          splitShare: 0.4,
          pages: [
            { page: "https://x.com/widgets", isWinner: true },
            { page: "https://x.com/widgets-2", isWinner: false },
          ],
        },
      ],
    });

    expect(opportunities.map((item) => item.kind).toSorted()).toEqual([
      "consolidate",
      "quick-win",
    ]);
  });

  it("keeps separate rows for the same query on different pages", () => {
    const opportunities = buildOpportunities({
      strikingDistance: [shared],
      ctrOpportunities: [
        { ...shared, page: "https://x.com/other", missedClicks: 40 },
      ],
      cannibalization: [],
    });

    expect(opportunities).toHaveLength(2);
  });
});

describe("quickWinHint", () => {
  it("returns undefined for an empty list -- nothing to break down", () => {
    expect(quickWinHint([])).toBeUndefined();
  });

  it("returns undefined when every opportunity is already a quick win", () => {
    const opportunities = [
      opportunity({ kind: "quick-win" }),
      opportunity({ kind: "quick-win" }),
    ];
    expect(quickWinHint(opportunities)).toBeUndefined();
  });

  it("names the count when some but not all are quick wins", () => {
    const opportunities = [
      opportunity({ kind: "quick-win" }),
      opportunity({ kind: "ctr" }),
      opportunity({ kind: "consolidate" }),
    ];
    expect(quickWinHint(opportunities)).toBe("1 quick win");
  });

  it("pluralizes for more than one", () => {
    const opportunities = [
      opportunity({ kind: "quick-win" }),
      opportunity({ kind: "quick-win" }),
      opportunity({ kind: "ctr" }),
    ];
    expect(quickWinHint(opportunities)).toBe("2 quick wins");
  });

  it("still reports zero when none are quick wins, since that's real signal", () => {
    const opportunities = [
      opportunity({ kind: "ctr" }),
      opportunity({ kind: "consolidate" }),
    ];
    expect(quickWinHint(opportunities)).toBe("0 quick wins");
  });
});

describe("buildTechnicalIssues", () => {
  it("groups on-page problems by severity then page count", () => {
    const issues = buildTechnicalIssues([
      auditPage({ url: "https://x.com/404", statusCode: 404 }),
      auditPage({ url: "https://x.com/no-title", title: "" }),
      auditPage({ url: "https://x.com/no-meta", metaDescription: null }),
      auditPage({ url: "https://x.com/two-h1", h1Count: 2 }),
      auditPage({ url: "https://x.com/thin", wordCount: 120 }),
      auditPage({ url: "https://x.com/alt", imagesMissingAlt: 4 }),
      auditPage(),
    ]);

    const keys = issues.map((issue) => issue.key);
    // High severity first: status and title.
    expect(keys.slice(0, 2).toSorted()).toEqual(["status", "title"]);
    // Low severity last.
    expect(keys[keys.length - 1]).toBe("alt");

    const thin = issues.find((issue) => issue.key === "thin");
    expect(thin?.pageCount).toBe(1);
    expect(thin?.examples).toEqual(["https://x.com/thin"]);
  });

  it("omits issues with no affected pages", () => {
    const issues = buildTechnicalIssues([auditPage(), auditPage()]);
    expect(issues).toEqual([]);
  });

  it("does not flag word count zero as thin (uncrawled body)", () => {
    const issues = buildTechnicalIssues([auditPage({ wordCount: 0 })]);
    expect(issues.some((issue) => issue.key === "thin")).toBe(false);
  });
});
