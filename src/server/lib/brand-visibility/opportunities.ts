import type { BrandLookupResult } from "@/types/schemas/ai-search";

/**
 * Derive "improve your AI visibility" opportunities from a single Brand Lookup
 * result — pure, and deliberately zero extra API cost: every signal here comes
 * from data the lookup already returned.
 *
 * Two gap types:
 *  - share_of_voice: a competitor the target is compared against earns more AI
 *    mentions than the target does.
 *  - prompt_absence: an AI answer cites other sources but not the target's own
 *    domain — an answer you're missing from. (Domain targets only; a keyword
 *    target has no domain to match against citations.)
 *
 * Fetching competitors' own cited pages would need extra paid calls, so it is
 * intentionally out of scope.
 */

export type OpportunityKind = "share_of_voice" | "prompt_absence";

export type Opportunity = {
  kind: OpportunityKind;
  title: string;
  detail: string;
  /** Ranking/display magnitude: mention gap (SoV) or AI search volume (prompt). */
  metric: number;
  competitor?: string;
  question?: string;
};

const MAX_PER_KIND = 5;

/** Lowercase and drop a leading www. so citation domains match the target. */
function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

/**
 * Whether a cited domain belongs to the target — the domain itself or any of its
 * subdomains (docs.acme.com, blog.acme.com all count as acme.com's own site), so
 * a citation of your own subdomain is never miscounted as a gap.
 */
function citesTarget(citedDomain: string | null, target: string): boolean {
  if (citedDomain == null) return false;
  const cited = normalizeDomain(citedDomain);
  return cited === target || cited.endsWith(`.${target}`);
}

function truncate(value: string, max = 80): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function shareOfVoiceGaps(result: BrandLookupResult): Opportunity[] {
  const entries = result.shareOfVoice?.entries ?? [];
  const target = entries.find((entry) => entry.isTarget);
  if (!target || target.mentions == null) return [];

  return entries
    .filter(
      (entry) =>
        !entry.isTarget &&
        entry.mentions != null &&
        entry.mentions > target.mentions!,
    )
    .map((entry): Opportunity => {
      const gap = entry.mentions! - target.mentions!;
      return {
        kind: "share_of_voice",
        title: `${entry.label} out-mentions you in AI answers`,
        detail: `${entry.label} earns ${gap} more AI mention${
          gap === 1 ? "" : "s"
        } than ${target.label}. Win back share with content AI answers cite.`,
        metric: gap,
        competitor: entry.label,
      };
    })
    .toSorted((a, b) => b.metric - a.metric)
    .slice(0, MAX_PER_KIND);
}

function promptAbsenceGaps(result: BrandLookupResult): Opportunity[] {
  if (result.detectedTargetType !== "domain") return [];
  const targetDomain = normalizeDomain(result.resolvedTarget);

  return result.topQueries
    .filter((row) => {
      if (row.citedSources.length === 0) return false;
      return !row.citedSources.some((source) =>
        citesTarget(source.domain, targetDomain),
      );
    })
    .map(
      (row): Opportunity => ({
        kind: "prompt_absence",
        title: truncate(row.question),
        detail: `AI answers to this question cite other sources but not ${result.resolvedTarget}. Earn a citation here.`,
        metric: row.aiSearchVolume ?? 0,
        question: row.question,
      }),
    )
    .toSorted((a, b) => b.metric - a.metric)
    .slice(0, MAX_PER_KIND);
}

/** SoV gaps first (the headline), then the prompts you're absent from. */
export function buildOpportunities(result: BrandLookupResult): Opportunity[] {
  return [...shareOfVoiceGaps(result), ...promptAbsenceGaps(result)];
}
