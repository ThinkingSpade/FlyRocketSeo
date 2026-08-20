import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getResults: vi.fn(),
  getAnalyticsPerformance: vi.fn(),
  // Typed at the seam the assertions read, so `mock.calls` carries the
  // suggestion shape and the helper below needs no cast to inspect it.
  replaceRulesSuggestions:
    vi.fn<
      (
        projectId: string,
        suggestions: Array<{ url: string; element: string }>,
      ) => Promise<{ added: number; kept: number; removed: number }>
    >(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/audit/services/AuditService", () => ({
  AuditService: {
    getHistory: mocks.getHistory,
    getResults: mocks.getResults,
  },
}));
// The real module reaches for Google credentials on import. Only the query
// lookup matters here, and `generate` is written to tolerate it failing, so the
// error classes are stubbed as the service's own code identifies them.
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getAnalyticsPerformance: mocks.getAnalyticsPerformance },
  GscNotConnectedError: class GscNotConnectedError extends Error {},
  isExpectedGrantFailure: () => false,
}));
vi.mock(
  "@/server/features/onpage/repositories/PageOptimizationRepository",
  () => ({
    PageOptimizationRepository: {
      replaceRulesSuggestions: mocks.replaceRulesSuggestions,
      listForProject: vi.fn(),
      setStatus: vi.fn(),
    },
  }),
);

async function loadService() {
  const { OnPageService } =
    await import("@/server/features/onpage/services/OnPageService");
  return OnPageService;
}

/** A crawl row with the emptiness a non-serving page is actually stored with:
 *  `emptyPageResult` writes an empty title, an empty meta and no H1, which is
 *  exactly what makes such a page match every content rule at once. */
function pageRow(url: string, statusCode: number | null) {
  return {
    url,
    statusCode,
    title: "",
    metaDescription: "",
    h1Count: 0,
    imagesJson: null,
  };
}

/** A page that genuinely served but has a defect worth suggesting a fix for. */
function servingPageRow(url: string) {
  return {
    url,
    statusCode: 200,
    title: "",
    metaDescription: "",
    h1Count: 0,
    imagesJson: null,
  };
}

/** The distinct URLs that reached the suggestion writer — i.e. the URLs that
 *  became rewrite candidates and so can reach the metered rewrite path. */
function candidateUrls(): string[] {
  const written = mocks.replaceRulesSuggestions.mock.calls[0]?.[1] ?? [];
  return [...new Set(written.map((row) => row.url))];
}

describe("OnPageService.generate — which pages become rewrite candidates", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getHistory.mockResolvedValue([
      { id: "audit_1", status: "completed" },
    ]);
    mocks.getAnalyticsPerformance.mockResolvedValue({ rows: [] });
    mocks.replaceRulesSuggestions.mockResolvedValue({
      added: 0,
      kept: 0,
      removed: 0,
    });
  });

  it("suggests fixes for a page that served a 200", async () => {
    mocks.getResults.mockResolvedValue({
      pages: [servingPageRow("https://example.com/live")],
    });

    const result = await (await loadService()).generate("proj_1", null);

    expect(candidateUrls()).toEqual(["https://example.com/live"]);
    expect(result.pagesAnalyzed).toBe(1);
    expect(result.pagesSkipped).toBe(0);
  });

  // Each of these is a URL that served no document, so its stored emptiness is
  // an artifact of the response rather than a content defect anyone can fix by
  // rewriting a tag. Table-driven so a future status cannot be added to the
  // implementation without a case here to match it.
  const NON_SERVING: Array<[string, number | null]> = [
    ["a permanent redirect", 301],
    ["a temporary redirect", 302],
    ["a not-found page", 404],
    ["a server error", 500],
    // The crawler's own encoding for a fetch that never completed.
    ["a page that never responded", 0],
    // Unreachable from any current write path, so this pins the deliberate
    // reading of it: not known to be serving, therefore not a candidate.
    ["a page with no recorded status", null],
  ];

  for (const [label, statusCode] of NON_SERVING) {
    it(`produces no rewrite candidate for ${label} (${String(statusCode)})`, async () => {
      mocks.getResults.mockResolvedValue({
        pages: [pageRow("https://example.com/dead", statusCode)],
      });

      const result = await (await loadService()).generate("proj_1", null);

      expect(candidateUrls()).toEqual([]);
      expect(result.pagesAnalyzed).toBe(0);
      expect(result.pagesSkipped).toBe(1);
    });
  }

  it("keeps the serving pages when a crawl mixes serving and non-serving", async () => {
    mocks.getResults.mockResolvedValue({
      pages: [
        servingPageRow("https://example.com/live"),
        pageRow("https://example.com/moved", 301),
        pageRow("https://example.com/gone", 404),
        pageRow("https://example.com/broken", 500),
        pageRow("https://example.com/timeout", 0),
        pageRow("https://example.com/unknown", null),
        servingPageRow("https://example.com/also-live"),
      ],
    });

    const result = await (await loadService()).generate("proj_1", null);

    expect(candidateUrls()).toEqual([
      "https://example.com/live",
      "https://example.com/also-live",
    ]);
    expect(result.pagesAnalyzed).toBe(2);
    expect(result.pagesSkipped).toBe(5);
  });

  it("reports a crawl with nothing serving as analyzed-none rather than all-clear", async () => {
    // The distinction the On-Page tab's empty state needs: "no fixes found"
    // and "nothing was reachable to look at" are the same empty list, and only
    // these counts tell them apart.
    mocks.getResults.mockResolvedValue({
      pages: [
        pageRow("https://example.com/gone", 404),
        pageRow("https://example.com/timeout", 0),
      ],
    });

    const result = await (await loadService()).generate("proj_1", null);

    expect(result.pagesAnalyzed).toBe(0);
    expect(result.pagesSkipped).toBe(2);
    // Still a normal, successful return — the tab must not look broken.
    expect(result.auditId).toBe("audit_1");
  });

  it("accepts the whole 2xx range, not just 200", async () => {
    mocks.getResults.mockResolvedValue({
      pages: [
        pageRow("https://example.com/created", 201),
        pageRow("https://example.com/no-content", 204),
        // The boundaries either side of 2xx, to pin the range.
        pageRow("https://example.com/continue", 199),
        pageRow("https://example.com/multiple-choices", 300),
      ],
    });

    const result = await (await loadService()).generate("proj_1", null);

    expect(candidateUrls()).toEqual([
      "https://example.com/created",
      "https://example.com/no-content",
    ]);
    expect(result.pagesAnalyzed).toBe(2);
  });

  it("still refuses a non-serving page that has stored content", async () => {
    // A 404 body is a real HTML document: the crawler records its <title>
    // ("Page not found") like any other. Filtering on emptiness instead of on
    // status would let this one through and offer to SEO-optimize the site's
    // error page.
    mocks.getResults.mockResolvedValue({
      pages: [
        {
          url: "https://example.com/gone",
          statusCode: 404,
          title: "Page not found",
          metaDescription: null,
          h1Count: 1,
          imagesJson: null,
        },
      ],
    });

    const result = await (await loadService()).generate("proj_1", null);

    expect(candidateUrls()).toEqual([]);
    expect(result.pagesAnalyzed).toBe(0);
  });

  it("throws rather than wiping suggestions when no crawl has completed", async () => {
    mocks.getHistory.mockResolvedValue([{ id: "audit_1", status: "running" }]);

    await expect(
      (await loadService()).generate("proj_1", null),
    ).rejects.toThrow(/Run a site audit first/);
    expect(mocks.replaceRulesSuggestions).not.toHaveBeenCalled();
  });
});
