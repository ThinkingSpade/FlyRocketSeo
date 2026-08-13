import type { AuditIssueSummary } from "@/client/features/insights/verdicts/audit";

/**
 * Turns raw crawled pages into the issue vocabulary buildAuditVerdict reads:
 * which issue types exist, how many pages each touches, and which specific
 * paths -- the join key against GSC's top-clicked paths.
 *
 * Minimal shape needed for classification. The real getAuditResults rows
 * (AuditResultsData["pages"]) carry many more crawl fields; keeping this to
 * just what's read here mirrors auditDiff.ts's DiffPage precedent in this
 * same feature, and keeps this module import-free of anything that could
 * drag a server-only dependency into its test.
 */
export type AuditIssuePage = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number | null;
  imagesMissingAlt: number;
  statusCode: number | null;
};

/** Below this word count a page reads as thin content by common practitioner
 *  convention -- not a hard Google rule, but the number most SEO checklists
 *  reach for first when a page under-serves its topic. */
const THIN_CONTENT_WORDS = 300;

function isBlank(value: string | null): boolean {
  return !value || value.trim() === "";
}

/** A page the server would not serve. Its body is an error page -- or nothing
 *  at all -- so measuring it as content says nothing about the site.
 *
 *  An error status is not the only way to fail: a fetch that never completed
 *  (DNS failure, TLS error, timeout, connection refused) is persisted as
 *  `statusCode: 0` with empty title/meta and no H1
 *  (`site-audit-workflow-helpers.ts`'s `emptyPageResult(url, 0, ...)`, and
 *  `siteAuditFallbackMapping.ts`'s `item.status_code ?? 0`). Testing only
 *  `>= 400` let that page through as measurable content, where its emptiness
 *  matched missing-title, missing-meta, missing-H1 and thin-content at once --
 *  four rows for one URL that never answered, three of them `ON_PAGE_FIXABLE`,
 *  so a dead URL was offered an AI title rewrite. `null` is the same claim
 *  with less detail: nothing ever recorded a response for this URL. */
function isBroken(page: AuditIssuePage): boolean {
  return (
    page.statusCode == null || page.statusCode < 200 || page.statusCode >= 400
  );
}

/** A page whose recorded response is a redirect.
 *
 *  The crawler follows hops itself (`url-policy.ts`'s
 *  `fetchValidatingEveryHop` walks the chain manually and returns the response
 *  it finally lands on), so a persisted 3xx means the chain ENDED on one --
 *  the response carried no `Location` to follow -- or the DataForSEO fallback
 *  reported the redirect verbatim (`siteAuditFallbackMapping.ts`'s
 *  `item.status_code`, which already declines to call a 3xx indexable). Either
 *  way no document was measured at this URL: a redirect body is typically not
 *  `text/html`, so it goes through `site-audit-workflow-helpers.ts`'s
 *  `emptyPageResult` with an empty title, an empty meta description, no H1 and
 *  a zero word count -- four content defects charged to one URL that only
 *  redirects, three of them `ON_PAGE_FIXABLE`, so a URL with nothing to
 *  rewrite was offered an AI title rewrite.
 *
 *  Deliberately NOT folded into `isBroken`: a redirect is not a broken page
 *  and calling it one would over-claim. The 300-399 bound is exactly the one
 *  `AuditResultsTableFilterLogic.ts`'s `matchesStatus` uses for its "redirect"
 *  filter bucket, so the Pages table and this issue list agree on what a
 *  redirect is rather than each holding its own definition. */
function isRedirect(page: AuditIssuePage): boolean {
  return (
    page.statusCode != null && page.statusCode >= 300 && page.statusCode < 400
  );
}

/** Whether this row is a document whose content can be judged at all.
 *
 *  `isBroken` and `isRedirect` between them cover every status that is not a
 *  2xx, and each has its own issue below, so every page this excludes is still
 *  reported -- once, as what was actually observed, instead of up to five
 *  times as content it never served. */
function servedContent(page: AuditIssuePage): boolean {
  return !isBroken(page) && !isRedirect(page);
}

/** Matches audit/shared.tsx's extractPathname exactly, duplicated locally
 *  rather than imported so this module stays a self-contained pure function
 *  with no React or icon library in its module graph (that file exports
 *  components alongside it). */
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

type IssueDef = {
  key: string;
  label: string;
  severity: AuditIssueSummary["severity"];
  matches: (page: AuditIssuePage) => boolean;
  /** True for the issues that describe the RESPONSE rather than the document.
   *  Only these may match a page that served no content, and each such page
   *  matches exactly one of them -- `isBroken` and `isRedirect` are disjoint.
   *  Declared beside the definition rather than tested by key at the call site
   *  so a future status issue cannot be added and silently left out. */
  describesResponse?: boolean;
};

// Exactly the fields already surfaced as columns in the Pages table
// (BacklinksTableColumns.tsx's audit counterpart, ResultsTables.tsx) --
// aggregated here rather than inventing an unfamiliar new vocabulary.
const ISSUE_DEFS: IssueDef[] = [
  {
    key: "broken-page",
    // Names both halves of `isBroken`: a page that answered with an error and
    // a page that never answered are the same defect to a visitor, and the
    // label is user-facing copy (the verdict quotes it verbatim).
    label: "Broken page (unreachable, 4xx or 5xx)",
    severity: "high",
    matches: isBroken,
    describesResponse: true,
  },
  {
    key: "redirect-page",
    // "Redirect" is the Pages table's own word for a 3xx (`matchesStatus`'s
    // "redirect" filter bucket), so the filter and this list name one concept.
    // The label claims only what was observed -- this URL answered with a
    // redirect -- and not that anything is broken: redirecting a retired URL
    // is ordinary and correct. The verdict quotes this verbatim, as
    // `Fix "..." on N high-traffic pages` and `"..." affects N of the M pages
    // earning the most clicks`, so it has to read as a noun phrase there.
    label: "Redirecting page (3xx status)",
    // Not `high`: a redirect is a detour, not a failure, and `high` would flip
    // the whole verdict's tone to "bad" over a working site.
    severity: "low",
    matches: isRedirect,
    describesResponse: true,
  },
  {
    key: "missing-title",
    label: "Missing title tag",
    severity: "high",
    matches: (page) => isBlank(page.title),
  },
  {
    key: "missing-meta-description",
    label: "Missing meta description",
    severity: "medium",
    matches: (page) => isBlank(page.metaDescription),
  },
  {
    key: "missing-h1",
    label: "Missing H1 heading",
    severity: "medium",
    matches: (page) => page.h1Count === 0,
  },
  {
    key: "thin-content",
    label: `Thin content (under ${THIN_CONTENT_WORDS} words)`,
    severity: "medium",
    // The served-content exclusion is applied to every content def in
    // `classifyAuditIssues`, so this only has to answer "is it thin".
    matches: (page) =>
      page.wordCount != null && page.wordCount < THIN_CONTENT_WORDS,
  },
  {
    key: "missing-alt-text",
    label: "Images missing alt text",
    severity: "low",
    matches: (page) => page.imagesMissingAlt > 0,
  },
];

export function classifyAuditIssues(pages: AuditIssuePage[]): {
  issues: AuditIssueSummary[];
  pathsByIssue: Record<string, string[]>;
} {
  const pathsByIssue: Record<string, string[]> = {};

  for (const def of ISSUE_DEFS) {
    const paths = pages
      // A page that served no document is reported once, under the response it
      // actually gave. It also has no title, no meta, no H1 and no images, so
      // without this it was counted again under every one of those -- up to
      // five rows for one URL, each inflating the verdict's traffic
      // intersection, which sums the clicks on each issue's paths. Worse, four
      // of those keys drive On-Page Fixes, so a URL that only 404s, or only
      // redirects, earned an AI-written title rewrite -- of a page there is no
      // content on to rewrite. `broken-page` and `redirect-page` already say
      // what was actually seen, and each names its own fix.
      .filter((page) => def.describesResponse === true || servedContent(page))
      .filter(def.matches)
      .map((page) => pathnameOf(page.url));
    if (paths.length > 0) pathsByIssue[def.key] = paths;
  }

  // pageCount is always paths.length -- one source of truth, so the verdict
  // module can never see a count that disagrees with the path list it also
  // receives.
  const issues: AuditIssueSummary[] = ISSUE_DEFS.filter(
    (def) => pathsByIssue[def.key] != null,
  ).map((def) => ({
    key: def.key,
    label: def.label,
    pageCount: pathsByIssue[def.key].length,
    severity: def.severity,
  }));

  return { issues, pathsByIssue };
}
