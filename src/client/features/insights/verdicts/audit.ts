import { unknownVerdict, type Verdict } from "../types";

/**
 * Reads a site audit the way a practitioner would: not "how many issues did
 * the crawler find" but "which of them sit on pages people actually reach."
 * An issue on a page with no clicks is not urgent -- the intersection with
 * traffic is the whole point of this card, not the raw issue count.
 */

export type AuditIssueSummary = {
  key: string;
  label: string;
  pageCount: number;
  severity: "high" | "medium" | "low";
};

type AuditVerdictInput = {
  pagesCrawled: number;
  issues: AuditIssueSummary[];
  /** Paths with the most GSC clicks, so the verdict can say which issues
   *  land on pages that actually earn traffic. */
  topPagePaths: string[];
  /** Paths each issue touches, keyed by issue key. */
  pathsByIssue: Record<string, string[]>;
};

/** Higher severities must outrank lower ones regardless of how many pages an
 *  issue touches -- one broken page on a top performer matters more than ten
 *  missing-alt-text hits on pages nobody reads past. Also used as the base of
 *  each action's weight, with the intersecting page count added on top so two
 *  issues of the same severity still rank by how much traffic they touch. */
const SEVERITY_WEIGHT: Record<AuditIssueSummary["severity"], number> = {
  high: 100,
  medium: 60,
  low: 30,
};

/** Cap the action list so the card stays scannable. The ranking above already
 *  puts the highest-severity, highest-traffic-hit issue first, so anything
 *  past this point is the least urgent of what was found. */
const MAX_AUDIT_ACTIONS = 3;

type IssueHit = { issue: AuditIssueSummary; hitCount: number };

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Every path any issue touches, deduplicated -- used only to give the
 *  "no click data" honest message a real, defensible count rather than the
 *  raw (possibly overlapping) sum of each issue's pageCount. */
function countDistinctAffectedPaths(pathsByIssue: Record<string, string[]>) {
  return new Set(Object.values(pathsByIssue).flat()).size;
}

function rankIntersectingIssues(
  issues: AuditIssueSummary[],
  pathsByIssue: Record<string, string[]>,
  topPagePaths: string[],
): IssueHit[] {
  const topPageSet = new Set(topPagePaths);
  return issues
    .map((issue) => {
      const paths = pathsByIssue[issue.key] ?? [];
      const hitCount = paths.filter((path) => topPageSet.has(path)).length;
      return { issue, hitCount };
    })
    .filter((entry) => entry.hitCount > 0)
    .toSorted((a, b) => {
      const severityDiff =
        SEVERITY_WEIGHT[b.issue.severity] - SEVERITY_WEIGHT[a.issue.severity];
      return severityDiff !== 0 ? severityDiff : b.hitCount - a.hitCount;
    });
}

export function buildAuditVerdict(input: AuditVerdictInput): Verdict {
  if (input.pagesCrawled <= 0) {
    return unknownVerdict(
      "This audit has not crawled any pages, so there is nothing to check for issues.",
    );
  }

  if (input.issues.length === 0) {
    const pageWord = input.pagesCrawled === 1 ? "page" : "pages";
    return {
      read: `No crawl issues were found across the ${input.pagesCrawled} ${pageWord} crawled.`,
      tone: "good",
      actions: [],
    };
  }

  if (input.topPagePaths.length === 0) {
    const affected = countDistinctAffectedPaths(input.pathsByIssue);
    return unknownVerdict(
      `This audit found issues on ${affected} of ${input.pagesCrawled} pages crawled, but no Search Console click data is available to tell which of them affect pages that actually earn traffic.`,
    );
  }

  const ranked = rankIntersectingIssues(
    input.issues,
    input.pathsByIssue,
    input.topPagePaths,
  );

  if (ranked.length === 0) {
    return {
      // Subject is "this crawl", not the issue count, so the verb never has
      // to agree with a number that might be 1 -- "this crawl found 1 issue
      // type" and "...found 2 issue types" are both correct as written.
      // Scope has to be explicit here. `topPagePaths` is at most the 20
      // top-clicked pages Search Console returned, so "none touch your
      // highest-traffic pages" is an all-clear over a 20-page check -- issues on
      // page 21 downward were never compared at all.
      read: `This crawl found ${pluralize(input.issues.length, "issue type")}, but none of them touch the ${pluralize(input.topPagePaths.length, "page")} earning the most clicks. Pages below those were not checked against traffic.`,
      tone: "good",
      actions: [],
    };
  }

  const tone: Verdict["tone"] = ranked.some(
    (entry) => entry.issue.severity === "high",
  )
    ? "bad"
    : "mixed";

  const top = ranked.slice(0, MAX_AUDIT_ACTIONS);
  const actions = top.map((entry) => ({
    label: `Fix "${entry.issue.label}" on ${pluralize(entry.hitCount, "high-traffic page")}`,
    // "N of your top-clicked pages" selects N members from a fixed group, so
    // "pages" stays plural regardless of N (unlike "N high-traffic page(s)"
    // above, which conjugates with N) -- written out rather than pluralize()
    // to avoid singularizing the group noun itself.
    // "sitewide" was wrong too: `pageCount` counts pages in THIS CRAWL, which
    // is not the whole site unless the crawl was exhaustive.
    evidence: `Affects ${entry.hitCount} of the ${input.topPagePaths.length} top-clicked pages (${entry.issue.pageCount} affected across the crawl)`,
    weight: SEVERITY_WEIGHT[entry.issue.severity] + entry.hitCount,
  }));

  const lead = top[0];
  const others = ranked.length - 1;
  const read = `"${lead.issue.label}" affects ${lead.hitCount} of the ${input.topPagePaths.length} pages earning the most clicks${
    others > 0
      ? `, alongside ${pluralize(others, "other issue type")} touching traffic-earning pages`
      : ""
  }.`;

  return { read, tone, actions };
}

/** The literal fix for each issue type -- what to actually change on the
 *  page, not just that something is wrong. Null for a key this table does
 *  not (yet) recognize, rather than a guess at a fix for it. */
const ISSUE_FIXES: Record<string, string> = {
  "broken-page": "Restore the page or 301-redirect it to a working URL.",
  "missing-title":
    "Add a unique, descriptive <title> tag (roughly 50-60 characters).",
  "missing-meta-description":
    "Write a unique meta description (roughly 150-160 characters) summarizing the page.",
  "missing-h1": "Add a single H1 heading that states the page's main topic.",
  // 300 words matches the thin-content threshold used to classify this issue
  // at the crawl-results wiring site (auditIssues.ts) -- kept as a literal
  // here so this module stays free of any dependency on that file.
  "thin-content":
    "Expand the content to cover the topic thoroughly -- aim for 300+ words.",
  "missing-alt-text": "Add descriptive alt text to every image on the page.",
};

export function auditRowNote(issueKey: string): string | null {
  return ISSUE_FIXES[issueKey] ?? null;
}
