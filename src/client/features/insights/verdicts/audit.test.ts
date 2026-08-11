import { describe, expect, it } from "vitest";
import {
  auditRowNote,
  buildAuditVerdict,
  type AuditIssueSummary,
} from "./audit";

describe("buildAuditVerdict", () => {
  it("says so when the audit crawled no pages", () => {
    const verdict = buildAuditVerdict({
      pagesCrawled: 0,
      issues: [],
      topPagePaths: [],
      pathsByIssue: {},
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "This audit has not crawled any pages, so there is nothing to check for issues.",
    );
  });

  it("calls it good when the crawl found no issues at all", () => {
    const verdict = buildAuditVerdict({
      pagesCrawled: 42,
      issues: [],
      topPagePaths: ["/a"],
      pathsByIssue: {},
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "No crawl issues were found across the 42 pages crawled.",
    );
  });

  it("says so when issues exist but there is no Search Console data to weigh them against", () => {
    const issues: AuditIssueSummary[] = [
      {
        key: "missing-title",
        label: "Missing title tag",
        pageCount: 5,
        severity: "high",
      },
    ];
    const verdict = buildAuditVerdict({
      pagesCrawled: 42,
      issues,
      topPagePaths: [],
      pathsByIssue: {
        "missing-title": ["/a", "/b", "/c", "/d", "/e"],
      },
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "This audit found issues on 5 of 42 pages crawled, but no Search Console click data is available to tell which of them affect pages that actually earn traffic.",
    );
  });

  it("calls it good when the crawl's issues touch none of the highest-traffic pages", () => {
    const issues: AuditIssueSummary[] = [
      {
        key: "missing-alt-text",
        label: "Images missing alt text",
        pageCount: 3,
        severity: "low",
      },
    ];
    const verdict = buildAuditVerdict({
      pagesCrawled: 10,
      issues,
      topPagePaths: ["/top1", "/top2"],
      pathsByIssue: {
        "missing-alt-text": ["/x", "/y", "/z"],
      },
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "This crawl found 1 issue type, but none of them touch the 2 pages earning the most clicks. Pages below those were not checked against traffic.",
    );
  });

  it("pluralizes the issue-type count when several issues all miss the top pages", () => {
    const issues: AuditIssueSummary[] = [
      {
        key: "missing-alt-text",
        label: "Images missing alt text",
        pageCount: 3,
        severity: "low",
      },
      {
        key: "thin-content",
        label: "Thin content",
        pageCount: 2,
        severity: "medium",
      },
    ];
    const verdict = buildAuditVerdict({
      pagesCrawled: 10,
      issues,
      topPagePaths: ["/top1"],
      pathsByIssue: {
        "missing-alt-text": ["/x", "/y", "/z"],
        "thin-content": ["/w", "/v"],
      },
    });

    expect(verdict.read).toBe(
      "This crawl found 2 issue types, but none of them touch the 1 page earning the most clicks. Pages below those were not checked against traffic.",
    );
  });

  it("pluralizes pages crawled correctly for a single-page audit with no issues", () => {
    const verdict = buildAuditVerdict({
      pagesCrawled: 1,
      issues: [],
      topPagePaths: [],
      pathsByIssue: {},
    });

    expect(verdict.read).toBe(
      "No crawl issues were found across the 1 page crawled.",
    );
  });

  it("calls it mixed when a medium-severity issue lands on exactly one high-traffic page", () => {
    const issues: AuditIssueSummary[] = [
      {
        key: "missing-meta-description",
        label: "Missing meta description",
        pageCount: 6,
        severity: "medium",
      },
    ];
    const verdict = buildAuditVerdict({
      pagesCrawled: 30,
      issues,
      topPagePaths: ["/blog/a", "/blog/c"],
      pathsByIssue: {
        "missing-meta-description": ["/blog/a", "/blog/b", "/other"],
      },
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      '"Missing meta description" affects 1 of the 2 pages earning the most clicks.',
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Fix "Missing meta description" on 1 high-traffic page',
        evidence:
          "Affects 1 of the 2 top-clicked pages (6 affected across the crawl)",
        to: { to: "/p/$projectId/on-page" },
        weight: 61,
      },
    ]);
  });

  it("calls it bad when a high-severity issue lands on a top page, ranking it above a medium issue with more hits", () => {
    const issues: AuditIssueSummary[] = [
      {
        key: "missing-title",
        label: "Missing title tag",
        pageCount: 4,
        severity: "high",
      },
      {
        key: "missing-h1",
        label: "Missing H1 heading",
        pageCount: 10,
        severity: "medium",
      },
    ];
    const verdict = buildAuditVerdict({
      pagesCrawled: 60,
      issues,
      topPagePaths: ["/blog/a", "/blog/b", "/blog/c"],
      pathsByIssue: {
        "missing-title": ["/blog/a", "/other1", "/other2", "/other3"],
        "missing-h1": [
          "/blog/a",
          "/blog/b",
          "/other4",
          "/other5",
          "/other6",
          "/other7",
          "/other8",
          "/other9",
          "/other10",
          "/other11",
        ],
      },
    });

    expect(verdict.tone).toBe("bad");
    // missing-h1 hits more top pages (2) than missing-title (1), but severity
    // outranks hit count -- the high-severity issue must sort first.
    expect(verdict.actions).toEqual([
      {
        label: 'Fix "Missing title tag" on 1 high-traffic page',
        evidence:
          "Affects 1 of the 3 top-clicked pages (4 affected across the crawl)",
        to: { to: "/p/$projectId/on-page" },
        weight: 101,
      },
      {
        label: 'Fix "Missing H1 heading" on 2 high-traffic pages',
        evidence:
          "Affects 2 of the 3 top-clicked pages (10 affected across the crawl)",
        to: { to: "/p/$projectId/on-page" },
        weight: 62,
      },
    ]);
    expect(verdict.read).toBe(
      '"Missing title tag" affects 1 of the 3 pages earning the most clicks, alongside 1 other issue type touching traffic-earning pages.',
    );
  });

  it("caps the action list at 3, dropping the weakest intersecting issue", () => {
    const issues: AuditIssueSummary[] = [
      { key: "i1", label: "Issue One", pageCount: 4, severity: "medium" },
      { key: "i2", label: "Issue Two", pageCount: 3, severity: "medium" },
      { key: "i3", label: "Issue Three", pageCount: 2, severity: "medium" },
      { key: "i4", label: "Issue Four", pageCount: 1, severity: "medium" },
    ];
    const topPagePaths = [
      "/p1",
      "/p2",
      "/p3",
      "/p4",
      "/p5",
      "/p6",
      "/p7",
      "/p8",
      "/p9",
      "/p10",
    ];
    const verdict = buildAuditVerdict({
      pagesCrawled: 50,
      issues,
      topPagePaths,
      pathsByIssue: {
        i1: ["/p1", "/p2", "/p3", "/p4"],
        i2: ["/p5", "/p6", "/p7"],
        i3: ["/p8", "/p9"],
        i4: ["/p10"],
      },
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.actions).toHaveLength(3);
    expect(verdict.actions.map((action) => action.label)).toEqual([
      'Fix "Issue One" on 4 high-traffic pages',
      'Fix "Issue Two" on 3 high-traffic pages',
      'Fix "Issue Three" on 2 high-traffic pages',
    ]);
  });
});

describe("auditRowNote", () => {
  it("gives the literal fix for a recognized issue key", () => {
    expect(auditRowNote("missing-title")).toBe(
      "Add a unique, descriptive <title> tag (roughly 50-60 characters).",
    );
    expect(auditRowNote("missing-meta-description")).toBe(
      "Write a unique meta description (roughly 150-160 characters) summarizing the page.",
    );
    expect(auditRowNote("broken-page")).toBe(
      "Restore the page or 301-redirect it to a working URL.",
    );
  });

  it("returns null for an unrecognized issue key", () => {
    expect(auditRowNote("some-future-issue-type")).toBeNull();
  });
});
