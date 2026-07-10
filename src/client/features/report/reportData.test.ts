import { describe, expect, it } from "vitest";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  auditIssueRows,
  computeAuditHealth,
  computeAveragePositions,
  computeMovers,
  filterEventsToRange,
  reportDevice,
} from "./reportData";
import { reportToMarkdown } from "./reportMarkdown";

const makeRow = (
  keyword: string,
  desktop: { position: number | null; previousPosition: number | null },
  searchVolume: number | null = null,
): RankTrackingRow => ({
  trackingKeywordId: `kw-${keyword}`,
  keyword,
  searchVolume,
  keywordDifficulty: null,
  cpc: null,
  desktop: { ...desktop, rankingUrl: null, serpFeatures: [] },
  mobile: {
    position: null,
    previousPosition: null,
    rankingUrl: null,
    serpFeatures: [],
  },
});

describe("reportDevice", () => {
  it("prefers desktop except for mobile-only configs", () => {
    expect(reportDevice("both")).toBe("desktop");
    expect(reportDevice("desktop")).toBe("desktop");
    expect(reportDevice("mobile")).toBe("mobile");
  });
});

describe("computeMovers", () => {
  it("classifies with the 4-case null rules and sorts ranked moves first", () => {
    const movers = computeMovers(
      [
        makeRow("small-climb", { position: 8, previousPosition: 10 }),
        makeRow("big-climb", { position: 2, previousPosition: 14 }),
        makeRow("new-entry", { position: 18, previousPosition: null }, 5000),
        makeRow("unchanged", { position: 5, previousPosition: 5 }),
        makeRow("never-ranked", { position: null, previousPosition: null }),
        makeRow("small-drop", { position: 12, previousPosition: 9 }),
        makeRow("lost", { position: null, previousPosition: 6 }, 900),
      ],
      "desktop",
    );

    expect(movers.improved.map((m) => m.keyword)).toEqual([
      "big-climb",
      "small-climb",
      "new-entry",
    ]);
    expect(movers.declined.map((m) => m.keyword)).toEqual([
      "small-drop",
      "lost",
    ]);
    expect(movers.improved[0].delta).toBe(12);
    expect(movers.improvedTotal).toBe(3);
    expect(movers.declinedTotal).toBe(2);
  });

  it("caps the lists but reports full totals", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      makeRow(`kw-${i}`, { position: 1 + i, previousPosition: 20 }),
    );
    const movers = computeMovers(rows, "desktop", 8);
    expect(movers.improved).toHaveLength(8);
    expect(movers.improvedTotal).toBe(12);
  });
});

describe("computeAveragePositions", () => {
  it("averages non-null positions independently for each side", () => {
    const averages = computeAveragePositions(
      [
        makeRow("a", { position: 2, previousPosition: 10 }),
        makeRow("b", { position: 6, previousPosition: null }),
        makeRow("c", { position: null, previousPosition: 20 }),
      ],
      "desktop",
    );
    expect(averages.current).toBe(4);
    expect(averages.previous).toBe(15);
  });

  it("returns nulls when nothing ranks", () => {
    expect(computeAveragePositions([], "desktop")).toEqual({
      current: null,
      previous: null,
    });
  });
});

const makeEvent = (id: string, eventDate: string) => ({
  id,
  eventDate,
  title: id,
  note: null,
});

describe("filterEventsToRange", () => {
  const now = new Date(2026, 6, 10, 12).getTime(); // Jul 10 2026 local

  it("keeps events inside the window, oldest first", () => {
    const events = filterEventsToRange(
      [
        makeEvent("new", "2026-07-01"),
        makeEvent("old", "2026-03-01"),
        makeEvent("edge", "2026-06-10"),
      ],
      30,
      now,
    );
    expect(events.map((e) => e.id)).toEqual(["edge", "new"]);
  });
});

const makePage = (
  overrides: Partial<Parameters<typeof computeAuditHealth>[0][number]>,
) => ({
  statusCode: 200,
  title: "Title",
  metaDescription: "Description",
  h1Count: 1,
  wordCount: 900,
  imagesMissingAlt: 0,
  isIndexable: true,
  ...overrides,
});

describe("computeAuditHealth + auditIssueRows", () => {
  it("buckets statuses and only flags on-page issues for OK pages", () => {
    const health = computeAuditHealth(
      [
        makePage({}),
        makePage({ metaDescription: null, imagesMissingAlt: 2 }),
        makePage({ title: null, h1Count: 0, wordCount: 120 }),
        makePage({ statusCode: 301, title: null }), // redirect: not an on-page issue
        makePage({ statusCode: 404 }),
        makePage({ statusCode: null }), // fetch error counts as broken
        makePage({ isIndexable: false }),
      ],
      [],
    );

    expect(health.pagesCrawled).toBe(7);
    expect(health.okPages).toBe(4);
    expect(health.redirectPages).toBe(1);
    expect(health.brokenPages).toBe(2);
    expect(health.indexablePages).toBe(3);
    expect(health.missingTitle).toBe(1);
    expect(health.missingDescription).toBe(1);
    expect(health.missingH1).toBe(1);
    expect(health.thinContent).toBe(1);
    expect(health.imagesMissingAlt).toBe(2);

    const labels = auditIssueRows(health).map((row) => row.label);
    expect(labels).toContain("Missing title tag");
    expect(labels).not.toContain("Redirected pages count"); // zero rows dropped
  });

  it("averages lighthouse scores per strategy, skipping nulls", () => {
    const health = computeAuditHealth(
      [],
      [
        {
          strategy: "mobile",
          performanceScore: 60,
          accessibilityScore: 90,
          bestPracticesScore: null,
          seoScore: 80,
        },
        {
          strategy: "mobile",
          performanceScore: 80,
          accessibilityScore: null,
          bestPracticesScore: null,
          seoScore: 90,
        },
        {
          strategy: "desktop",
          performanceScore: 95,
          accessibilityScore: 96,
          bestPracticesScore: 97,
          seoScore: 98,
        },
      ],
    );

    expect(health.lighthouse.mobile).toEqual({
      performance: 70,
      accessibility: 90,
      bestPractices: null,
      seo: 85,
      sampleSize: 2,
    });
    expect(health.lighthouse.desktop.performance).toBe(95);
    expect(health.lighthouse.desktop.sampleSize).toBe(1);
  });
});

describe("reportToMarkdown", () => {
  it("renders every populated section as GFM", () => {
    const markdown = reportToMarkdown({
      projectName: "Acme",
      projectDomain: "acme-demo.com",
      rangeLabel: "Last 30 days",
      generatedAt: "Jul 10, 2026",
      rankBlocks: [
        {
          domain: "acme-demo.com",
          device: "desktop",
          keywordCount: 20,
          visibility: 42.5,
          visibilityDelta: 3.2,
          ranking: 17,
          rankingDelta: 2,
          top3: 5,
          top10: 11,
          improved: 9,
          declined: 3,
          avgPosition: 8.4,
          avgPositionPrevious: 11.1,
          movers: {
            improved: [
              {
                keyword: "ai content optimization",
                searchVolume: 2400,
                previousPosition: 13,
                currentPosition: 1,
                delta: 12,
              },
            ],
            declined: [],
            improvedTotal: 9,
            declinedTotal: 0,
          },
        },
      ],
      events: [
        {
          id: "e1",
          eventDate: "2026-06-15",
          title: "Published 5 comparison posts",
          note: null,
        },
      ],
      audit: {
        completedAt: "2026-07-06 09:22:00",
        health: computeAuditHealth(
          [
            {
              statusCode: 200,
              title: null,
              metaDescription: "d",
              h1Count: 1,
              wordCount: 500,
              imagesMissingAlt: 0,
              isIndexable: true,
            },
          ],
          [],
        ),
      },
      gsc: {
        clicks: 1200,
        impressions: 90000,
        ctr: 0.0133,
        position: 12.3,
        prevClicks: 900,
        prevImpressions: 71000,
      },
    });

    expect(markdown).toContain("# SEO Report — acme-demo.com");
    expect(markdown).toContain("| Visibility | 42.5% | +3.2 pts |");
    expect(markdown).toContain(
      "- ai content optimization: #13 → #1 (vol 2400)",
    );
    expect(markdown).toContain("## Google Search Console");
    expect(markdown).toContain("- 2026-06-15: Published 5 comparison posts");
    expect(markdown).toContain("| Missing title tag | 1 |");
  });
});
