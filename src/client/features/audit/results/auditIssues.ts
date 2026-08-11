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

/** A page the server would not serve. Its body is an error page, so measuring
 *  it as content says nothing about the site. */
function isBroken(page: AuditIssuePage): boolean {
  return page.statusCode != null && page.statusCode >= 400;
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
};

// Exactly the fields already surfaced as columns in the Pages table
// (BacklinksTableColumns.tsx's audit counterpart, ResultsTables.tsx) --
// aggregated here rather than inventing an unfamiliar new vocabulary.
const ISSUE_DEFS: IssueDef[] = [
  {
    key: "broken-page",
    label: "Broken page (4xx/5xx status)",
    severity: "high",
    matches: isBroken,
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
    // A 404 body is short by definition, so without the status guard every
    // broken page was reported twice -- once as broken and again as thin --
    // inflating the issue list and, worse, the verdict's traffic intersection,
    // which sums the clicks on each issue's paths. The fix for a 404 is not
    // "write more words"; it is already covered by `broken-page`.
    matches: (page) =>
      !isBroken(page) &&
      page.wordCount != null &&
      page.wordCount < THIN_CONTENT_WORDS,
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
    const paths = pages.filter(def.matches).map((page) => pathnameOf(page.url));
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
