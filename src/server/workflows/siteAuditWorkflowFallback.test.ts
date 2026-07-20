import { describe, it, expect } from "vitest";
import type { InstantPageAuditItem } from "@/server/lib/dataforseo/onpage";
import {
  instantPageToStepPageResult,
  selectLabsSeedUrls,
} from "@/server/workflows/siteAuditFallbackMapping";

describe("instantPageToStepPageResult", () => {
  it("maps DataForSEO instant_pages fields into the audit page result", () => {
    const item: InstantPageAuditItem = {
      url: "https://example.com/page",
      status_code: 200,
      meta: {
        title: "Example Page",
        description: "A meta description",
        canonical: "https://example.com/page",
        images_count: 4,
        htags: { h1: ["Main"], h2: ["A", "B"], h3: null },
        content: { plain_text_word_count: 320 },
      },
      page_timing: { duration_time: 512.6 },
    };

    const result = instantPageToStepPageResult("https://seed.example/x", item);

    expect(result.url).toBe("https://example.com/page");
    expect(result.statusCode).toBe(200);
    expect(result.title).toBe("Example Page");
    expect(result.metaDescription).toBe("A meta description");
    expect(result.canonicalUrl).toBe("https://example.com/page");
    expect(result.h1Count).toBe(1);
    expect(result.h2Count).toBe(2);
    expect(result.h3Count).toBe(0);
    expect(result.wordCount).toBe(320);
    expect(result.imagesTotal).toBe(4);
    expect(result.isIndexable).toBe(true);
    expect(result.responseTimeMs).toBe(513);
    expect(typeof result.id).toBe("string");
    // Fields instant_pages can't provide are neutral, not fabricated.
    expect(result.internalLinks).toEqual([]);
    expect(result.imagesMissingAlt).toBe(0);
  });

  it("uses safe defaults and the seed URL when fields are missing", () => {
    const result = instantPageToStepPageResult(
      "https://seed.example/",
      {} as InstantPageAuditItem,
    );
    expect(result.url).toBe("https://seed.example/");
    expect(result.statusCode).toBe(0);
    expect(result.title).toBe("");
    expect(result.canonicalUrl).toBeNull();
    expect(result.h1Count).toBe(0);
    expect(result.wordCount).toBe(0);
    expect(result.isIndexable).toBe(false);
  });

  it("marks non-2xx pages non-indexable", () => {
    const result = instantPageToStepPageResult("https://seed.example/gone", {
      status_code: 404,
    } as InstantPageAuditItem);
    expect(result.statusCode).toBe(404);
    expect(result.isIndexable).toBe(false);
  });
});

describe("selectLabsSeedUrls", () => {
  const origin = "https://example.com/";

  it("keeps same-origin URLs, dropping other hosts and junk values", () => {
    expect(
      selectLabsSeedUrls(
        origin,
        [
          "https://example.com/pricing",
          "https://other.example.net/stolen",
          null,
          undefined,
          "not a url",
          "https://example.com/blog/post",
        ],
        10,
      ),
    ).toEqual(["https://example.com/pricing", "https://example.com/blog/post"]);
  });

  it("dedupes after normalization and respects the limit", () => {
    const selected = selectLabsSeedUrls(
      origin,
      [
        "https://example.com/a",
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
      ],
      2,
    );
    expect(selected).toHaveLength(2);
    expect(selected[0]).toContain("/a");
  });
});
