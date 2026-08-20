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

/** What the crawl actually stores for a URL whose chain ended on a 3xx: the
 *  body is not text/html, so `emptyPageResult` writes empty strings and
 *  zeroes -- indistinguishable from a page with no title, no meta, no H1 and
 *  no words unless the status is read. */
function redirectRow(statusCode: number, url: string): AuditIssuePage {
  return page({
    url,
    statusCode,
    title: "",
    metaDescription: "",
    h1Count: 0,
    wordCount: 0,
  });
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
        label: "Broken page (unreachable, 4xx or 5xx)",
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

  it("counts a page that never responded (status 0) once, as broken", () => {
    // A failed fetch -- DNS, TLS, timeout, connection refused -- is persisted
    // as statusCode 0 with empty title/meta and no H1, not as a 4xx. Testing
    // only `>= 400` let it through as measurable content, where its emptiness
    // matched four more issues, three of them ON_PAGE_FIXABLE. That is the
    // ordinary shape of a dead URL in this app's own crawl data.
    const { issues, pathsByIssue } = classifyAuditIssues([
      {
        url: "https://example.com/unreachable",
        statusCode: 0,
        title: "",
        metaDescription: "",
        h1Count: 0,
        wordCount: 0,
        imagesMissingAlt: 0,
      },
    ]);

    expect(issues.map((issue) => issue.key)).toEqual(["broken-page"]);
    expect(pathsByIssue["broken-page"]).toEqual(["/unreachable"]);
    expect(pathsByIssue["missing-title"]).toBeUndefined();
    expect(pathsByIssue["missing-meta-description"]).toBeUndefined();
    expect(pathsByIssue["missing-h1"]).toBeUndefined();
    expect(pathsByIssue["thin-content"]).toBeUndefined();
  });

  it("treats a page with no recorded status the same way", () => {
    // `statusCode` is nullable in the schema, and a row with none never
    // evidenced a response either -- so it is not a page whose content we can
    // report on.
    const { issues, pathsByIssue } = classifyAuditIssues([
      {
        url: "https://example.com/no-status",
        statusCode: null,
        title: null,
        metaDescription: null,
        h1Count: 0,
        wordCount: 4,
        imagesMissingAlt: 1,
      },
    ]);

    expect(issues.map((issue) => issue.key)).toEqual(["broken-page"]);
    expect(pathsByIssue["missing-title"]).toBeUndefined();
    expect(pathsByIssue["missing-alt-text"]).toBeUndefined();
  });

  it("does not multiply one unreachable page across the verdict's counts", () => {
    // The verdict sums the clicks on each issue's paths, so a URL appearing
    // under four keys counted its traffic four times.
    const { issues } = classifyAuditIssues([
      {
        url: "https://example.com/unreachable",
        statusCode: 0,
        title: "",
        metaDescription: "",
        h1Count: 0,
        wordCount: 0,
        imagesMissingAlt: 0,
      },
      {
        url: "https://example.com/live",
        statusCode: 200,
        title: "A fine title",
        metaDescription: "A fine description.",
        h1Count: 1,
        wordCount: 900,
        imagesMissingAlt: 0,
      },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].pageCount).toBe(1);
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

describe("a redirecting page is a redirect, not four content defects", () => {
  it.each([301, 302, 307, 308])(
    "counts a %i once, as a redirect, not as four content defects",
    (statusCode) => {
      // Exactly one issue, so the verdict -- which sums the clicks on each
      // issue's paths -- cannot charge this URL's traffic four times over, and
      // three of those four keys no longer offer it an AI title rewrite.
      const { issues, pathsByIssue } = classifyAuditIssues([
        redirectRow(statusCode, "https://example.com/old"),
      ]);

      expect(issues).toEqual([
        {
          key: "redirect-page",
          label: "Redirecting page (3xx status)",
          pageCount: 1,
          severity: "low",
        },
      ]);
      expect(pathsByIssue["redirect-page"]).toEqual(["/old"]);
      expect(pathsByIssue["missing-title"]).toBeUndefined();
      expect(pathsByIssue["missing-meta-description"]).toBeUndefined();
      expect(pathsByIssue["missing-h1"]).toBeUndefined();
      expect(pathsByIssue["thin-content"]).toBeUndefined();
    },
  );

  it("does not call a redirect broken", () => {
    // The Pages table keeps a separate "redirect" bucket from its error one
    // (AuditResultsTableFilterLogic's matchesStatus), and a 301 is a working
    // site behaving correctly. Widening `broken-page` to cover it would print
    // "Broken page (unreachable, 4xx or 5xx)" over a URL that is none of
    // those.
    const { pathsByIssue } = classifyAuditIssues([
      redirectRow(301, "https://example.com/old"),
    ]);

    expect(pathsByIssue["broken-page"]).toBeUndefined();
  });

  it("keeps a redirect out of missing-alt-text, the fourth fixable key", () => {
    // The four ON_PAGE_FIXABLE keys are what ResultsView links to the On-Page
    // Fixes tab, whose rewrite path is metered. The other three are covered
    // above; alt text needs its own row because it is the one that requires a
    // non-zero count rather than an absence.
    const { pathsByIssue } = classifyAuditIssues([
      page({
        ...redirectRow(308, "https://example.com/moved"),
        imagesMissingAlt: 4,
      }),
    ]);

    expect(pathsByIssue["missing-alt-text"]).toBeUndefined();
    expect(pathsByIssue["redirect-page"]).toEqual(["/moved"]);
  });

  it("reports a 3xx and a 4xx under their own issues, one row each", () => {
    const { issues, pathsByIssue } = classifyAuditIssues([
      redirectRow(301, "https://example.com/old"),
      { ...redirectRow(404, "https://example.com/gone"), title: null },
    ]);

    expect(issues.map((issue) => issue.key)).toEqual([
      "broken-page",
      "redirect-page",
    ]);
    expect(pathsByIssue["broken-page"]).toEqual(["/gone"]);
    expect(pathsByIssue["redirect-page"]).toEqual(["/old"]);
    expect(pathsByIssue["missing-title"]).toBeUndefined();
  });

  it.each([300, 399])("treats %i as a redirect, covering both edges", (s) => {
    // 300-399 is exactly the range AuditResultsTableFilterLogic's matchesStatus
    // calls a redirect. Pinned so the two definitions cannot drift apart.
    const { pathsByIssue } = classifyAuditIssues([
      redirectRow(s, "https://example.com/edge"),
    ]);

    expect(pathsByIssue["redirect-page"]).toEqual(["/edge"]);
  });

  it("pulls in neither 299 nor 400, one off either end", () => {
    const { pathsByIssue } = classifyAuditIssues([
      { ...redirectRow(299, "https://example.com/odd"), wordCount: 5 },
      redirectRow(400, "https://example.com/bad"),
    ]);

    expect(pathsByIssue["redirect-page"]).toBeUndefined();
    // 400 is broken; 299 is a 2xx, so it stays an ordinary content row and its
    // real emptiness is still reported rather than swallowed by this fix.
    expect(pathsByIssue["broken-page"]).toEqual(["/bad"]);
    expect(pathsByIssue["missing-title"]).toEqual(["/odd"]);
    expect(pathsByIssue["thin-content"]).toEqual(["/odd"]);
  });

  it("still measures content on a 200 that sits beside a redirect", () => {
    // The exclusion is per page, not per crawl: a real content defect on a
    // page that did serve must survive a redirect elsewhere in the same run.
    const { pathsByIssue } = classifyAuditIssues([
      redirectRow(307, "https://example.com/old"),
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

    expect(pathsByIssue["redirect-page"]).toEqual(["/old"]);
    expect(pathsByIssue["missing-title"]).toEqual(["/live"]);
    expect(pathsByIssue["missing-meta-description"]).toEqual(["/live"]);
    expect(pathsByIssue["missing-h1"]).toEqual(["/live"]);
    expect(pathsByIssue["thin-content"]).toEqual(["/live"]);
    expect(pathsByIssue["missing-alt-text"]).toEqual(["/live"]);
    expect(pathsByIssue["broken-page"]).toBeUndefined();
  });
});
