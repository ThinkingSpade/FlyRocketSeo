import {
  classifyKeyword,
  hasUsableProfile,
} from "@/shared/keyword-fit/keywordFit";

/**
 * Pure view-model for the On-Page Fixes tab (no I/O), split out so the grouping
 * and progress math are unit-testable.
 */

export type OnPageElement = "title" | "meta" | "h1" | "alt";
export type OnPageStatus = "pending" | "approved" | "excluded";

export type FixRow = {
  id: string;
  url: string;
  element: OnPageElement;
  target: string;
  currentValue: string | null;
  suggestedValue: string;
  reason: string;
  source: "rules" | "ai";
  status: OnPageStatus;
};

export const ELEMENT_LABEL: Record<OnPageElement, string> = {
  title: "Page titles",
  meta: "Meta descriptions",
  h1: "H1 headings",
  alt: "Image alt text",
};

const ELEMENT_ORDER: OnPageElement[] = ["title", "meta", "h1", "alt"];

export type ElementProgress = {
  element: OnPageElement;
  label: string;
  total: number;
  approved: number;
  pending: number;
  excluded: number;
};

/** Per-element counts for the progress tiles, in a stable display order. */
export function elementProgress(rows: FixRow[]): ElementProgress[] {
  return ELEMENT_ORDER.map((element) => {
    const forElement = rows.filter((row) => row.element === element);
    return {
      element,
      label: ELEMENT_LABEL[element],
      total: forElement.length,
      approved: forElement.filter((row) => row.status === "approved").length,
      pending: forElement.filter((row) => row.status === "pending").length,
      excluded: forElement.filter((row) => row.status === "excluded").length,
    };
  }).filter((progress) => progress.total > 0);
}

type FixSummary = {
  total: number;
  approved: number;
  pending: number;
  excluded: number;
  /** approved / (total - excluded), 0..1; excluded work isn't "remaining". */
  completion: number;
};

/** Headline counts across every element. */
export function summarize(rows: FixRow[]): FixSummary {
  const approved = rows.filter((row) => row.status === "approved").length;
  const excluded = rows.filter((row) => row.status === "excluded").length;
  const pending = rows.filter((row) => row.status === "pending").length;
  const actionable = rows.length - excluded;
  return {
    total: rows.length,
    approved,
    pending,
    excluded,
    completion: actionable > 0 ? approved / actionable : 0,
  };
}

export type PageGroup = {
  url: string;
  path: string;
  rows: FixRow[];
  /** The ids an "approve all on this page" click submits. The card used to
   *  recompute its own copy of this and never read the field beside it, so
   *  the two were free to disagree; there is one now. */
  pendingIds: string[];
  /** Search Console clicks for this page, or null when there is no row for it
   *  — which means either "no clicks in the window" or "not connected", and
   *  the sort must not treat either as evidence the page is worthless. */
  clicks: number | null;
};

/** Display a URL as its path, so the grouped list doesn't repeat the domain. */
export function toPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search || "/";
  } catch {
    return url;
  }
}

/**
 * Join key between a crawled page URL and a Search Console page row.
 *
 * Path only, lowercased, trailing slash dropped: GSC reports the canonical
 * property URL, which can differ from the crawled one on scheme, host case or
 * a www prefix, and none of those make it a different page here.
 */
export function pageTrafficKey(url: string): string {
  const path = toPath(url).toLowerCase();
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Clicks per page, summed across Search Console's query × page rows. */
export function clicksByPage(
  rows: readonly { page: string; clicks: number }[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = pageTrafficKey(row.page);
    totals.set(key, (totals.get(key) ?? 0) + row.clicks);
  }
  return totals;
}

/**
 * Group fixes by page, highest-traffic page first.
 *
 * The old order was how much work was LEFT on each page, which put the page
 * with eleven untouched alt-text rows above the one that earns the site's
 * clicks — a worklist sorted by the size of the chore rather than by what
 * fixing it is worth. Remaining work is now only the tie-break, which is also
 * what the whole list falls back to when Search Console is not connected: an
 * empty `clicks` map reproduces the previous ordering exactly.
 */
export function groupByPage(
  rows: FixRow[],
  filter: OnPageStatus | "all" = "all",
  clicks: ReadonlyMap<string, number> = new Map(),
): PageGroup[] {
  const visible =
    filter === "all" ? rows : rows.filter((row) => row.status === filter);
  const byUrl = new Map<string, FixRow[]>();
  for (const row of visible) {
    const list = byUrl.get(row.url) ?? [];
    list.push(row);
    byUrl.set(row.url, list);
  }

  return [...byUrl.entries()]
    .map(([url, groupRows]) => ({
      url,
      path: toPath(url),
      rows: groupRows.toSorted(
        (a, b) =>
          ELEMENT_ORDER.indexOf(a.element) - ELEMENT_ORDER.indexOf(b.element),
      ),
      pendingIds: groupRows
        .filter((row) => row.status === "pending")
        .map((row) => row.id),
      clicks: clicks.get(pageTrafficKey(url)) ?? null,
    }))
    .toSorted(
      (a, b) =>
        (b.clicks ?? 0) - (a.clicks ?? 0) ||
        b.pendingIds.length - a.pendingIds.length ||
        b.rows.length - a.rows.length,
    );
}

/**
 * Move the page an inbound link asked about to the front, leaving every other
 * page in the order it arrived in.
 *
 * Matched on `pageTrafficKey`, not on the raw string. The `?u=` value comes
 * from the CTR table, which reports Search Console's canonical page URL, while
 * `group.url` is the crawled one -- the same two sides `pageTrafficKey` exists
 * to join, differing on scheme, host case, a www prefix or a trailing slash. A
 * raw `===` matched neither of those, so the handoff silently did nothing and
 * the user landed back in plain traffic order on the page they had just been
 * told to rewrite.
 *
 * Sorted, not filtered: the other pages are the context that makes one rewrite
 * worth doing before another. `toSorted` is stable, so the traffic ranking
 * underneath survives intact.
 */
export function focusFirst<T extends { url: string }>(
  groups: T[],
  focusUrl: string | null | undefined,
): T[] {
  if (!focusUrl) return groups;
  const focusKey = pageTrafficKey(focusUrl);
  const rank = (group: T) => (pageTrafficKey(group.url) === focusKey ? 0 : 1);
  return groups.toSorted((a, b) => rank(a) - rank(b));
}

/** Ids eligible for a bulk "approve all pending" action. */
export function pendingIds(rows: FixRow[]): string[] {
  return rows.filter((row) => row.status === "pending").map((row) => row.id);
}

/** Rows the AI rewrite pass can target: pending title/meta only. Exported for
 *  `aiRewrite.ts`, which decides how many of them one metered click sends. */
export function isAiRewritable(row: FixRow): boolean {
  return (
    row.status === "pending" &&
    (row.element === "title" || row.element === "meta")
  );
}

/** Ids the AI rewrite pass should target: pending title/meta only. */
export function aiRewritableIds(rows: FixRow[]): string[] {
  return rows.filter(isAiRewritable).map((row) => row.id);
}

function pageCount(count: number): string {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

// Not exported: the page reads this shape by inference from
// `describeEmptyFixes`, so naming it across the boundary would only add a
// second declaration to keep in step with the function that builds it.
type EmptyFixesCopy = { title: string; body: string };

/**
 * What an empty fix list means, given what the generate pass actually looked at.
 *
 * "No fixes found" and "nothing was reachable to look at" produce the identical
 * empty list, and only `pagesAnalyzed`/`pagesSkipped` tell them apart. Calling
 * the second one a clean audit tells an agency their pages are fine when not
 * one of them was read — the same failure the client report guards against in
 * `describeOnPageStatus`.
 *
 * `pagesSkipped` supports exactly one claim: those pages returned no 2xx, so
 * their content was never judged. It does not say why any individual URL did,
 * so nothing here names a cause for one.
 */
export function describeEmptyFixes(result: {
  pagesAnalyzed: number;
  pagesSkipped: number;
}): EmptyFixesCopy {
  if (result.pagesAnalyzed === 0 && result.pagesSkipped > 0) {
    return {
      title: "No pages could be analyzed",
      body: `The crawl recorded ${pageCount(result.pagesSkipped)} and none returned a 2xx response, so no page content was analyzed. This is not a clean bill of health — it is not evidence your pages are clean. Check that the site is reachable, re-run the site audit, then generate fixes again.`,
    };
  }
  if (result.pagesAnalyzed === 0) {
    return {
      title: "No pages to analyze",
      body: "The latest completed audit recorded no crawled pages, so there was nothing to analyze. This is not a clean bill of health — run the site audit again, then generate fixes.",
    };
  }
  const skipped =
    result.pagesSkipped > 0
      ? ` ${pageCount(result.pagesSkipped)} did not return a 2xx response and so went unanalyzed.`
      : "";
  return {
    title: "No fixes found",
    body: `The last crawl analyzed ${pageCount(result.pagesAnalyzed)} and found no title, meta, heading, or alt-text fixes to make.${skipped} Query-informed title suggestions also depend on Search Console rows, which come back capped, so a page ranking further down may still have one.`,
  };
}

/** Prose about the business. Alt text describes an image, so the profile has
 *  nothing to say about it. */
const PROSE_ELEMENTS: OnPageElement[] = ["title", "meta", "h1"];

/**
 * Suggestions that advertise something this client says they do not do,
 * keyed by row id.
 *
 * Nothing that writes these suggestions — neither the rule-based pass nor the
 * LLM rewrite — is told what the business sells, and this is the one feature
 * whose entire output is prose about the business. So a vending operator who
 * only places machines gets offered "Buy Vending Machines in Dallas" as a
 * page title, in their own words, ready to approve.
 *
 * Exclusion verdicts only: `adjacent` is meaningless for a page title, which
 * is not a search. Free and client-side, over rows already on screen.
 */
export function offOfferSuggestions(
  rows: FixRow[],
  // `FitProfile` isn't exported; this is the same two fields the classifier
  // reads, which is all this needs to accept.
  profile: { offer: string; exclusions: string },
): Map<string, string> {
  const flagged = new Map<string, string>();
  // An empty profile must produce no verdicts rather than guessed ones —
  // same contract the keyword tables hold.
  if (!hasUsableProfile(profile)) return flagged;

  for (const row of rows) {
    if (!PROSE_ELEMENTS.includes(row.element)) continue;
    const result = classifyKeyword(row.suggestedValue, profile);
    if (result.verdict === "wrong-customer") flagged.set(row.id, result.reason);
  }
  return flagged;
}
