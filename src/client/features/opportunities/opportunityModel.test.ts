import { describe, expect, it } from "vitest";
import {
  buildOpportunities,
  buildTechnicalIssues,
  quickWinClicks,
} from "./opportunityModel";

function auditPage(overrides: Partial<Parameters<typeof buildTechnicalIssues>[0][number]> = {}) {
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
