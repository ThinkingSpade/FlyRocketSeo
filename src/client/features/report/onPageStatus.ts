/**
 * Which on-page story the report should tell, given what the crawl produced.
 *
 * The distinction that matters is "clean" vs "unavailable": if an audit records
 * pages but none of their details load — a failed fetch, or an audit whose
 * config no longer parses — the honest answer is that we could not check, not
 * that the site is healthy. Telling a client their site is clean on missing
 * data is the worst failure mode this report has.
 */
type OnPageStatus = "no-audit" | "issues" | "clean" | "unavailable";

export function describeOnPageStatus({
  pagesCrawled,
  pagesAnalyzed,
  issuesFound,
}: {
  /** Pages the audit recorded crawling, or null when no audit has completed. */
  pagesCrawled: number | null;
  /** Page rows actually available to inspect. */
  pagesAnalyzed: number;
  issuesFound: number;
}): OnPageStatus {
  if (pagesCrawled == null) return "no-audit";
  if (issuesFound > 0) return "issues";
  if (pagesAnalyzed > 0) return "clean";
  return "unavailable";
}
