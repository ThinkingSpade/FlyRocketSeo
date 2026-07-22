/**
 * Rule-based on-page fix generation (no I/O, no model call) so the rules are
 * unit-testable and cost nothing to run.
 *
 * The rules are keyword-informed rather than cosmetic: the strongest signal we
 * have is that a page already earns impressions for queries its own title
 * never mentions. That gap is real, measurable SEO value, and it comes from
 * free first-party Search Console data.
 */

/** Google truncates titles around this width in most SERP layouts. */
export const TITLE_MAX = 60;
const TITLE_MIN = 30;
/** Meta descriptions are clipped past roughly this length. */
export const META_MAX = 160;
const META_MIN = 70;

export type OnPageElement = "title" | "meta" | "h1" | "alt";

export type PageInput = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  images: Array<{ src: string | null; alt: string | null }>;
  /** Queries this page already earns impressions for, best first. */
  queries?: Array<{ query: string; impressions: number }>;
};

export type Suggestion = {
  url: string;
  element: OnPageElement;
  /** The image src an "alt" suggestion applies to; null for page elements. */
  target: string | null;
  currentValue: string | null;
  suggestedValue: string;
  reason: string;
};

/** Title Case a slug or filename: "office-coffee-station" → "Office Coffee Station". */
function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** The last meaningful path segment, cleaned up. Empty for the homepage. */
export function slugWords(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const segments = path.split("/").filter(Boolean);
  const last = segments.at(-1) ?? "";
  // Drop a file extension and any leading date prefix the CMS added.
  const cleaned = last
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return titleCase(decodeURIComponent(cleaned));
}

/** Cut to a maximum length without splitting a word or leaving punctuation. */
export function truncateWords(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const clipped = trimmed.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return base.replace(/[\s,;:.\-–—|]+$/, "");
}

function containsPhrase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** The query this page earns the most impressions for, if any. */
function topQuery(page: PageInput): string | null {
  const best = (page.queries ?? [])
    .filter((row) => row.query.trim() !== "")
    .toSorted((a, b) => b.impressions - a.impressions)[0];
  return best?.query ?? null;
}

function buildTitleSuggestion(
  page: PageInput,
  brand: string | null,
): Suggestion | null {
  const current = (page.title ?? "").trim();
  const query = topQuery(page);
  const suffix = brand ? ` | ${brand}` : "";

  if (current === "") {
    const base = query ? titleCase(query) : slugWords(page.url) || "Home";
    return {
      url: page.url,
      element: "title",
      target: null,
      currentValue: null,
      suggestedValue: truncateWords(`${base}${suffix}`, TITLE_MAX),
      reason:
        "This page has no title tag — the single strongest on-page signal. Google will invent one from the page content instead.",
    };
  }

  if (current.length > TITLE_MAX) {
    return {
      url: page.url,
      element: "title",
      target: null,
      currentValue: current,
      suggestedValue: truncateWords(current, TITLE_MAX),
      reason: `At ${current.length} characters this title is cut off in search results. Trimming to ${TITLE_MAX} keeps the whole promise visible.`,
    };
  }

  // The high-value case: the page already ranks for a query it never names.
  if (query && !containsPhrase(current, query)) {
    const candidate = `${titleCase(query)} | ${current}`;
    return {
      url: page.url,
      element: "title",
      target: null,
      currentValue: current,
      suggestedValue: truncateWords(candidate, TITLE_MAX),
      reason: `This page already earns impressions for "${query}", but the title never uses that phrase. Naming it directly is the cheapest ranking gain available.`,
    };
  }

  if (current.length < TITLE_MIN) {
    return {
      url: page.url,
      element: "title",
      target: null,
      currentValue: current,
      suggestedValue: truncateWords(`${current}${suffix}`, TITLE_MAX),
      reason: `At ${current.length} characters this title wastes most of the width Google gives you. There is room to say more about the page.`,
    };
  }

  return null;
}

function buildMetaSuggestion(page: PageInput): Suggestion | null {
  const current = (page.metaDescription ?? "").trim();
  const query = topQuery(page);
  const subject = query ? titleCase(query) : slugWords(page.url) || "this page";

  if (current === "") {
    const draft = `${subject} — ${(page.title ?? "").trim() || subject}. Learn more and see what we offer.`;
    return {
      url: page.url,
      element: "meta",
      target: null,
      currentValue: null,
      suggestedValue: truncateWords(draft, META_MAX),
      reason:
        "No meta description, so Google writes its own snippet from page text — you lose control of the pitch that earns the click.",
    };
  }

  if (current.length > META_MAX) {
    return {
      url: page.url,
      element: "meta",
      target: null,
      currentValue: current,
      suggestedValue: truncateWords(current, META_MAX),
      reason: `At ${current.length} characters this description is truncated mid-sentence in results. ${META_MAX} keeps it whole.`,
    };
  }

  if (current.length < META_MIN) {
    return {
      url: page.url,
      element: "meta",
      target: null,
      currentValue: current,
      suggestedValue: current,
      reason: `At ${current.length} characters this description is shorter than the space available. Expanding toward ${META_MAX} gives more reason to click.`,
    };
  }

  return null;
}

function buildH1Suggestion(page: PageInput): Suggestion | null {
  if (page.h1Count === 1) return null;

  const query = topQuery(page);
  const base =
    (page.title ?? "").trim() ||
    (query ? titleCase(query) : slugWords(page.url)) ||
    "Home";

  if (page.h1Count === 0) {
    return {
      url: page.url,
      element: "h1",
      target: null,
      currentValue: null,
      suggestedValue: base,
      reason:
        "This page has no H1. Every page should state its topic once, in the largest heading, so readers and crawlers agree on what it is about.",
    };
  }

  return {
    url: page.url,
    element: "h1",
    target: null,
    currentValue: `${page.h1Count} H1 tags`,
    suggestedValue: base,
    reason: `This page has ${page.h1Count} H1 tags competing to define its topic. Keep one and demote the rest to H2.`,
  };
}

/** Derive alt text from an image's filename — the only signal a crawl gives us. */
export function altFromSrc(src: string): string | null {
  const withoutQuery = src.split(/[?#]/)[0];
  const file = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";
  const stem = file.replace(/\.[a-z0-9]+$/i, "");
  // Hashes, tracking ids and "IMG_2024" tell a reader nothing.
  if (stem.length < 3) return null;
  if (/^[0-9a-f]{8,}$/i.test(stem)) return null;
  if (!/[a-z]/i.test(stem.replace(/^img[_-]?/i, ""))) return null;

  const words = titleCase(stem.replace(/[0-9]{3,}/g, " "));
  return words.trim() === "" ? null : words.trim();
}

function buildAltSuggestions(page: PageInput): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const image of page.images) {
    if (!image.src || (image.alt ?? "").trim() !== "") continue;
    const derived = altFromSrc(image.src);
    if (!derived) continue;
    suggestions.push({
      url: page.url,
      element: "alt",
      target: image.src,
      currentValue: null,
      suggestedValue: derived,
      reason:
        "This image has no alt text, so it is invisible to screen readers and to image search.",
    });
  }
  return suggestions;
}

/**
 * Every fix worth making on one page. `brand` is appended to short titles when
 * known; pass null to leave titles unbranded.
 */
export function buildPageSuggestions(
  page: PageInput,
  brand: string | null = null,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const title = buildTitleSuggestion(page, brand);
  if (title) suggestions.push(title);
  const meta = buildMetaSuggestion(page);
  if (meta) suggestions.push(meta);
  const h1 = buildH1Suggestion(page);
  if (h1) suggestions.push(h1);
  suggestions.push(...buildAltSuggestions(page));
  return suggestions;
}

/** Every fix across a crawl, page order preserved. */
export function buildSuggestions(
  pages: PageInput[],
  brand: string | null = null,
): Suggestion[] {
  return pages.flatMap((page) => buildPageSuggestions(page, brand));
}

/** Counts per element for the progress tiles. */
export function countByElement(
  suggestions: Array<{ element: OnPageElement }>,
): Record<OnPageElement, number> {
  const counts: Record<OnPageElement, number> = {
    title: 0,
    meta: 0,
    h1: 0,
    alt: 0,
  };
  for (const suggestion of suggestions) counts[suggestion.element] += 1;
  return counts;
}
