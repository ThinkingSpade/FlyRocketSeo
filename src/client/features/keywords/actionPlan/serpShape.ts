/**
 * What KIND of page Google is currently rewarding for a keyword.
 *
 * The single most actionable thing a SERP tells you is the shape of the thing
 * that wins. Ten service pages means writing a guide is wasted work, and ten
 * guides means a service page will not rank however good the offer is. Both
 * are visible from the ranking URLs alone -- no extra fetch, no extra credit.
 *
 * This reads paths, so it is a strong hint rather than a measurement. It is
 * reported as "mostly X" with a count, never as a fact about every result.
 */

type SerpPageType =
  | "homepage"
  | "service"
  | "article"
  | "listing"
  | "other";

const SERVICE_SEGMENTS = [
  "service",
  "services",
  "solutions",
  "products",
  "product",
  "shop",
  "pricing",
];
const ARTICLE_SEGMENTS = [
  "blog",
  "article",
  "articles",
  "news",
  "guide",
  "guides",
  "resources",
  "learn",
  "post",
];
const LISTING_SEGMENTS = [
  "best",
  "top",
  "directory",
  "reviews",
  "compare",
  "vs",
  "list",
];

function segmentsOf(url: string): string[] {
  try {
    return new URL(url).pathname.toLowerCase().split("/").filter(Boolean);
  } catch {
    return [];
  }
}

export function classifySerpPage(url: string): SerpPageType {
  const segments = segmentsOf(url);
  if (segments.length === 0) return "homepage";

  const joined = segments.join(" ");
  // Article before service: "/blog/best-vending-services" is an article about
  // services, not a service page, and the leading segment is what says so.
  if (ARTICLE_SEGMENTS.some((segment) => segments.includes(segment))) {
    return "article";
  }
  if (
    LISTING_SEGMENTS.some((segment) => joined.split(/[\s-]+/).includes(segment))
  ) {
    return "listing";
  }
  if (SERVICE_SEGMENTS.some((segment) => segments.includes(segment))) {
    return "service";
  }
  return "other";
}

type SerpShape = {
  dominant: SerpPageType;
  count: number;
  total: number;
};

const SHAPE_LABELS: Record<SerpPageType, string> = {
  homepage: "home pages",
  service: "service or product pages",
  article: "blog posts and guides",
  listing: "roundups and “best of” lists",
  other: "assorted pages",
};

export function serpPageTypeLabel(type: SerpPageType): string {
  return SHAPE_LABELS[type];
}

/**
 * The most common page type across the ranking URLs.
 *
 * Ties break toward the type that appears HIGHER, since position one describes
 * the intent better than position ten does. Returns null for an empty SERP
 * rather than inventing a shape.
 */
export function summarizeSerpShape(
  urls: ReadonlyArray<string>,
): SerpShape | null {
  if (urls.length === 0) return null;

  const counts = new Map<SerpPageType, number>();
  const firstSeen = new Map<SerpPageType, number>();
  urls.forEach((url, index) => {
    const type = classifySerpPage(url);
    counts.set(type, (counts.get(type) ?? 0) + 1);
    if (!firstSeen.has(type)) firstSeen.set(type, index);
  });

  let dominant: SerpPageType = "other";
  let best = -1;
  for (const [type, count] of counts) {
    const isBetter =
      count > best ||
      (count === best &&
        (firstSeen.get(type) ?? Infinity) <
          (firstSeen.get(dominant) ?? Infinity));
    if (isBetter) {
      dominant = type;
      best = count;
    }
  }

  return { dominant, count: best, total: urls.length };
}
