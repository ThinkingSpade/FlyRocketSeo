import { describe, expect, it } from "vitest";
import {
  computeAuditDiff,
  computeLighthouseSummary,
  LIGHTHOUSE_CHANGE_THRESHOLD,
  type AuditRunData,
  type DiffLighthouseRow,
  type DiffPage,
} from "./auditDiff";

function page(
  id: string,
  url: string,
  statusCode: number | null = 200,
): DiffPage {
  return { id, url, statusCode };
}

function lh(
  pageId: string,
  scores: Partial<Omit<DiffLighthouseRow, "pageId">> = {},
): DiffLighthouseRow {
  return {
    pageId,
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    errorMessage: null,
    ...scores,
  };
}

function run(
  pages: DiffPage[],
  lighthouse: DiffLighthouseRow[] = [],
): AuditRunData {
  return { pages, lighthouse };
}

describe("computeLighthouseSummary", () => {
  it("averages only successful rows and counts failures", () => {
    const summary = computeLighthouseSummary([
      lh("p1", { performanceScore: 80, seoScore: 90, accessibilityScore: 70 }),
      lh("p2", { performanceScore: 90, seoScore: 100, accessibilityScore: 80 }),
      // All-null scores read as a Lighthouse failure and are excluded.
      lh("p3"),
      lh("p4", { errorMessage: "timeout", performanceScore: 10 }),
    ]);
    expect(summary.failed).toBe(2);
    expect(summary.avgPerformance).toBe(85);
    expect(summary.avgSeo).toBe(95);
    expect(summary.avgAccessibility).toBe(75);
  });

  it("returns null averages when there are no successful rows", () => {
    const summary = computeLighthouseSummary([]);
    expect(summary).toEqual({
      failed: 0,
      avgPerformance: null,
      avgSeo: null,
      avgAccessibility: null,
    });
  });
});

describe("computeAuditDiff", () => {
  it("treats fully disjoint URL sets as all new and all removed", () => {
    const current = run([
      page("a1", "https://x.com/a"),
      page("a2", "https://x.com/b"),
    ]);
    const comparison = run([page("b1", "https://x.com/c")]);

    const diff = computeAuditDiff(current, comparison);
    expect(diff.newPages.map((p) => p.url)).toEqual([
      "https://x.com/a",
      "https://x.com/b",
    ]);
    expect(diff.removedPages.map((p) => p.url)).toEqual(["https://x.com/c"]);
    expect(diff.changedPages).toHaveLength(0);
    expect(diff.currentPageCount).toBe(2);
    expect(diff.comparisonPageCount).toBe(1);
    expect(diff.pageCountDelta).toBe(1);
  });

  it("reports zero diff for identical runs", () => {
    const pages = [
      page("p1", "https://x.com/a", 200),
      page("p2", "https://x.com/b", 200),
    ];
    const lighthouse = [
      lh("p1", { performanceScore: 80, seoScore: 90, accessibilityScore: 70 }),
      lh("p2", { performanceScore: 60, seoScore: 88, accessibilityScore: 95 }),
    ];
    const diff = computeAuditDiff(
      run(pages, lighthouse),
      run(pages, lighthouse),
    );

    expect(diff.newPages).toHaveLength(0);
    expect(diff.removedPages).toHaveLength(0);
    expect(diff.changedPages).toHaveLength(0);
    expect(diff.pageCountDelta).toBe(0);
    expect(diff.lighthouse.performanceDelta).toBe(0);
    expect(diff.lighthouse.seoDelta).toBe(0);
    expect(diff.lighthouse.accessibilityDelta).toBe(0);
    expect(diff.hasLighthouse).toBe(true);
  });

  it("flags a changed HTTP status and a changed Lighthouse score", () => {
    const current = run(
      [page("c1", "https://x.com/a", 404), page("c2", "https://x.com/b", 200)],
      [
        lh("c2", {
          performanceScore: 90,
          seoScore: 90,
          accessibilityScore: 90,
        }),
      ],
    );
    const comparison = run(
      [page("p1", "https://x.com/a", 200), page("p2", "https://x.com/b", 200)],
      [
        lh("p2", {
          performanceScore: 70,
          seoScore: 90,
          accessibilityScore: 90,
        }),
      ],
    );

    const diff = computeAuditDiff(current, comparison);
    expect(diff.newPages).toHaveLength(0);
    expect(diff.removedPages).toHaveLength(0);
    expect(diff.changedPages).toHaveLength(2);

    const byUrl = Object.fromEntries(diff.changedPages.map((p) => [p.url, p]));
    // /a only changed status (no lighthouse), /b only changed a score.
    expect(byUrl["https://x.com/a"].statusChanged).toBe(true);
    expect(byUrl["https://x.com/a"].currentStatus).toBe(404);
    expect(byUrl["https://x.com/a"].previousStatus).toBe(200);
    expect(byUrl["https://x.com/b"].statusChanged).toBe(false);
    expect(byUrl["https://x.com/b"].performanceDelta).toBe(20);
  });

  it("ignores Lighthouse jitter within the threshold", () => {
    const current = run(
      [page("c1", "https://x.com/a", 200)],
      [lh("c1", { performanceScore: 80 + LIGHTHOUSE_CHANGE_THRESHOLD })],
    );
    const comparison = run(
      [page("p1", "https://x.com/a", 200)],
      [lh("p1", { performanceScore: 80 })],
    );

    // A move of exactly the threshold is not "beyond" it, so no change.
    const diff = computeAuditDiff(current, comparison);
    expect(diff.changedPages).toHaveLength(0);
  });
});
