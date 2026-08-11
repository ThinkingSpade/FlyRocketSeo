import { describe, expect, it } from "vitest";
import { classifyAuditIssues, type AuditIssuePage } from "./auditIssues";

function page(overrides: Partial<AuditIssuePage> = {}): AuditIssuePage {
  return {
    url: "https://example.com/page",
    title: "A fine title",
    metaDescription: "A fine description that is reasonably descriptive.",
    h1Count: 1,
    wordCount: 800,
    imagesMissingAlt: 0,
    statusCode: 200,
    ...overrides,
  };
}

describe("classifyAuditIssues", () => {
  it("returns no issues for a fully clean crawl", () => {
    const result = classifyAuditIssues([
      page(),
      page({ url: "https://example.com/other" }),
    ]);

    expect(result.issues).toEqual([]);
    expect(result.pathsByIssue).toEqual({});
  });

  it("flags a broken page (4xx/5xx status)", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/dead", statusCode: 404 }),
    ]);

    expect(result.issues).toEqual([
      {
        key: "broken-page",
        label: "Broken page (4xx/5xx status)",
        pageCount: 1,
        severity: "high",
      },
    ]);
    expect(result.pathsByIssue["broken-page"]).toEqual(["/dead"]);
  });

  it("flags a missing title", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/no-title", title: null }),
    ]);

    expect(result.issues).toEqual([
      {
        key: "missing-title",
        label: "Missing title tag",
        pageCount: 1,
        severity: "high",
      },
    ]);
  });

  it("treats a blank (whitespace-only) title the same as a missing one", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/blank-title", title: "   " }),
    ]);

    expect(result.pathsByIssue["missing-title"]).toEqual(["/blank-title"]);
  });

  it("flags a missing meta description", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/no-meta", metaDescription: null }),
    ]);

    expect(result.issues).toEqual([
      {
        key: "missing-meta-description",
        label: "Missing meta description",
        pageCount: 1,
        severity: "medium",
      },
    ]);
  });

  it("flags a missing H1", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/no-h1", h1Count: 0 }),
    ]);

    expect(result.issues).toEqual([
      {
        key: "missing-h1",
        label: "Missing H1 heading",
        pageCount: 1,
        severity: "medium",
      },
    ]);
  });

  it("flags thin content under the word-count floor", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/thin", wordCount: 120 }),
    ]);

    expect(result.issues).toEqual([
      {
        key: "thin-content",
        label: "Thin content (under 300 words)",
        pageCount: 1,
        severity: "medium",
      },
    ]);
  });

  it("does not flag thin content exactly at the word-count floor", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/exactly-300", wordCount: 300 }),
    ]);

    expect(result.pathsByIssue["thin-content"]).toBeUndefined();
  });

  it("does not flag thin content when word count is unknown", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/unknown-words", wordCount: null }),
    ]);

    expect(result.pathsByIssue["thin-content"]).toBeUndefined();
  });

  it("does not report a broken page as thin content as well", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/gone", statusCode: 404, wordCount: 12 }),
    ]);

    expect(result.pathsByIssue["broken-page"]).toEqual(["/gone"]);
    expect(result.pathsByIssue["thin-content"]).toBeUndefined();
  });

  it("still flags thin content on a page that responded 200", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/stub", statusCode: 200, wordCount: 12 }),
    ]);

    expect(result.pathsByIssue["thin-content"]).toEqual(["/stub"]);
  });

  it("counts a broken thin page once, not twice, across the issue list", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/gone", statusCode: 500, wordCount: 8 }),
      page({ url: "https://example.com/stub", statusCode: 200, wordCount: 8 }),
    ]);

    const counts = Object.fromEntries(
      result.issues.map((issue) => [issue.key, issue.pageCount]),
    );
    expect(counts["broken-page"]).toBe(1);
    expect(counts["thin-content"]).toBe(1);
  });

  it("flags images missing alt text", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/images", imagesMissingAlt: 3 }),
    ]);

    expect(result.issues).toEqual([
      {
        key: "missing-alt-text",
        label: "Images missing alt text",
        pageCount: 1,
        severity: "low",
      },
    ]);
  });

  it("counts pageCount as the number of distinct pages carrying an issue", () => {
    const result = classifyAuditIssues([
      page({ url: "https://example.com/a", title: null }),
      page({ url: "https://example.com/b", title: null }),
      page({ url: "https://example.com/c" }),
    ]);

    const missingTitle = result.issues.find(
      (issue) => issue.key === "missing-title",
    );
    expect(missingTitle?.pageCount).toBe(2);
    expect(result.pathsByIssue["missing-title"]).toEqual(["/a", "/b"]);
    // Invariant the verdict module relies on: pageCount always matches the
    // length of that issue's own path list, never computed independently.
    expect(missingTitle?.pageCount).toBe(
      result.pathsByIssue["missing-title"].length,
    );
  });

  it("normalizes page URLs to pathnames, dropping origin and query", () => {
    const result = classifyAuditIssues([
      page({
        url: "https://example.com/blog/post?utm_source=x#section",
        statusCode: 500,
      }),
    ]);

    expect(result.pathsByIssue["broken-page"]).toEqual(["/blog/post"]);
  });

  it("classifies one page against every issue type it actually matches", () => {
    const result = classifyAuditIssues([
      page({
        url: "https://example.com/many-problems",
        title: null,
        metaDescription: null,
        h1Count: 0,
        wordCount: 50,
        imagesMissingAlt: 2,
        statusCode: 200,
      }),
    ]);

    const keys = result.issues.map((issue) => issue.key).toSorted();
    expect(keys).toEqual(
      [
        "missing-alt-text",
        "missing-h1",
        "missing-meta-description",
        "missing-title",
        "thin-content",
      ].toSorted(),
    );
  });
});

describe("a broken page is one issue, not five", () => {
  it("does not also report it as missing title, meta, h1 or alt text", () => {
    // A 404 body has none of those, so every broken page used to appear under
    // all five keys. That inflated the issue list, inflated the verdict's
    // traffic intersection (which sums the clicks on each issue's paths), and
    // fed four of those keys into On-Page Fixes -- earning a dead URL an
    // AI-written title rewrite. The fix for a 404 is a redirect.
    const { issues, pathsByIssue } = classifyAuditIssues([
      {
        url: "https://example.com/gone",
        statusCode: 404,
        title: null,
        metaDescription: null,
        h1Count: 0,
        wordCount: 3,
        imagesMissingAlt: 2,
      },
    ]);

    expect(issues.map((issue) => issue.key)).toEqual(["broken-page"]);
    expect(pathsByIssue["missing-title"]).toBeUndefined();
    expect(pathsByIssue["thin-content"]).toBeUndefined();
    expect(pathsByIssue["missing-alt-text"]).toBeUndefined();
  });

  it("still reports those defects on a page that loads", () => {
    const { pathsByIssue } = classifyAuditIssues([
      {
        url: "https://example.com/live",
        statusCode: 200,
        title: null,
        metaDescription: null,
        h1Count: 0,
        wordCount: 3,
        imagesMissingAlt: 2,
      },
    ]);

    expect(pathsByIssue["missing-title"]).toEqual(["/live"]);
    expect(pathsByIssue["missing-h1"]).toEqual(["/live"]);
    expect(pathsByIssue["thin-content"]).toEqual(["/live"]);
    expect(pathsByIssue["missing-alt-text"]).toEqual(["/live"]);
    expect(pathsByIssue["broken-page"]).toBeUndefined();
  });
});
