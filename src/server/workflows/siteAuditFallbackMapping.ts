import type { InstantPageAuditItem } from "@/server/lib/dataforseo/onpage";
import type { StepPageResult } from "@/server/lib/audit/types";

// Pure mapping (no I/O), split out so it's unit-testable without pulling the
// DataForSEO client + its `cloudflare:workers` env dependency into the test env.

/**
 * Map a DataForSEO instant_pages result to the audit's StepPageResult.
 * instant_pages returns COUNTS (not lists) for links/images and no per-image alt
 * data, so those list-shaped fields are best-effort/empty. The core on-page SEO
 * signals — status, title, meta description, canonical, heading counts, word
 * count — are populated, which is what the audit's checks primarily read.
 */
export function instantPageToStepPageResult(
  seedUrl: string,
  item: InstantPageAuditItem,
): StepPageResult {
  const meta = item.meta ?? {};
  const htags = meta.htags ?? {};
  const countHeading = (tag: string): number => {
    const values = htags[tag];
    return Array.isArray(values) ? values.length : 0;
  };
  const statusCode = item.status_code ?? 0;

  return {
    id: crypto.randomUUID(),
    url: item.url ?? seedUrl,
    statusCode,
    redirectUrl: null,
    title: meta.title ?? "",
    metaDescription: meta.description ?? "",
    canonicalUrl: meta.canonical ?? null,
    robotsMeta: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    h1Count: countHeading("h1"),
    h2Count: countHeading("h2"),
    h3Count: countHeading("h3"),
    h4Count: countHeading("h4"),
    h5Count: countHeading("h5"),
    h6Count: countHeading("h6"),
    // instant_pages exposes an htags dict, not document order, so heading order
    // (used only for the "headings out of order" check) can't be reconstructed.
    headingOrder: [],
    wordCount: meta.content?.plain_text_word_count ?? 0,
    imagesTotal: meta.images_count ?? 0,
    // Per-image alt text isn't returned by instant_pages; leave the alt-audit
    // neutral rather than fabricating failures.
    imagesMissingAlt: 0,
    images: [],
    // Only counts are returned, not the link lists; the fallback seeds crawling
    // from the sitemap, so it doesn't need discovered links.
    internalLinks: [],
    externalLinks: [],
    hasStructuredData: false,
    hreflangTags: [],
    isIndexable: statusCode >= 200 && statusCode < 300,
    responseTimeMs: Math.round(item.page_timing?.duration_time ?? 0),
  };
}
