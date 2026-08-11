// Pure scoring for the SEO Opportunities tab (no I/O), split out so the
// prioritization is unit-testable.

import type { FitResult } from "@/shared/keyword-fit/keywordFit";

export type OpportunityKind = "quick-win" | "ctr" | "consolidate";

export type Opportunity = {
  kind: OpportunityKind;
  query: string;
  /** The page to work on (the best-ranking one for the query). */
  page: string;
  position: number;
  impressions: number;
  /** Estimated extra monthly clicks if the fix works. */
  clicksAtStake: number;
  /** Extra context for the row, e.g. "3 pages competing". */
  detail?: string;
};

// Same blended CTR curve the SERP tools use; only relative weights matter.
const CTR_BY_POSITION: Record<number, number> = {
  1: 0.27,
  2: 0.15,
  3: 0.11,
  4: 0.08,
  5: 0.06,
  6: 0.05,
  7: 0.04,
  8: 0.03,
  9: 0.025,
  10: 0.02,
};
/** What a page realistically earns once it reaches the top 3. */
const TARGET_CTR = CTR_BY_POSITION[3];

function ctrFor(position: number): number {
  const rounded = Math.round(position);
  if (rounded < 1) return 0;
  return CTR_BY_POSITION[rounded] ?? (rounded <= 20 ? 0.01 : 0.005);
}

/**
 * Consolidation recovers only part of the split traffic — the loser's share
 * doesn't transfer cleanly — so its estimate is discounted rather than
 * counted like a ranking gain.
 */
const CONSOLIDATION_RECOVERY = 0.3;

type StrikingDistanceRow = {
  query: string;
  page: string;
  impressions: number;
  position: number;
};

type CtrOpportunityRow = {
  query: string;
  page: string;
  impressions: number;
  position: number;
  missedClicks: number;
};

type CannibalizationRow = {
  query: string;
  totalImpressions: number;
  splitShare: number;
  pages: Array<{ page: string; isWinner: boolean }>;
};

/** Clicks unlocked by lifting a page from where it sits into the top 3. */
export function quickWinClicks(impressions: number, position: number): number {
  const gain = TARGET_CTR - ctrFor(position);
  return gain <= 0 ? 0 : Math.round(impressions * gain);
}

/** A query the site is barely shown for isn't an opportunity yet, however
 *  the rounding falls — demand has to exist before ranking work pays. */
const MIN_IMPRESSIONS = 10;

/**
 * Merge every click-denominated signal into one list ranked by estimated
 * monthly clicks at stake. Rows below the demand floor or worth less than a
 * click are dropped — a "do this next" list should not be padded with noise.
 */
export function buildOpportunities(input: {
  strikingDistance: StrikingDistanceRow[];
  ctrOpportunities: CtrOpportunityRow[];
  cannibalization: CannibalizationRow[];
}): Opportunity[] {
  // Keyed by query+page because the three sources overlap: one row at position
  // 8 with high impressions and no clicks legitimately appears in striking
  // distance AND ctr opportunities. Those are two descriptions of the same
  // impressions reaching the top three, not two independent gains, so emitting
  // both and summing them inflated the headline "clicks at stake".
  const byTarget = new Map<string, Opportunity>();

  function merge(candidate: Opportunity): void {
    const key = keyOf(candidate.query, candidate.page);
    const existing = byTarget.get(key);
    if (!existing) {
      byTarget.set(key, candidate);
      return;
    }
    // Take the larger scenario, never the sum: moving the row into the top
    // three already subsumes part or all of the title-rewrite gain. The kind
    // follows the larger estimate so the headline action is the bigger win, and
    // both signals stay named in the detail so the merge is not silent.
    const leading =
      candidate.clicksAtStake > existing.clicksAtStake ? candidate : existing;
    const trailing = leading === candidate ? existing : candidate;
    byTarget.set(key, {
      ...leading,
      clicksAtStake: leading.clicksAtStake,
      detail:
        leading.detail && trailing.detail
          ? `${leading.detail}. Also ${lowerFirst(trailing.detail)}`
          : (leading.detail ?? trailing.detail),
    });
  }

  // Only the striking-distance and CTR signals get merged. They describe the
  // same impressions reaching the top three, so summing them double-counts.
  // Consolidation is a DIFFERENT task on the same page -- merging it away lost
  // the "consolidate" kind, which drives both the badge and the row's CTA, and
  // sent the user to "Build brief" for work that is actually about deleting or
  // redirecting a competing URL.
  const overlapping: Opportunity[] = [];
  const standalone: Opportunity[] = [];

  for (const row of input.strikingDistance) {
    overlapping.push({
      kind: "quick-win",
      query: row.query,
      page: row.page,
      position: row.position,
      impressions: row.impressions,
      clicksAtStake: quickWinClicks(row.impressions, row.position),
      detail: `Ranks #${Math.round(row.position)} — reaching the top 3 is the win`,
    });
  }

  for (const row of input.ctrOpportunities) {
    overlapping.push({
      kind: "ctr",
      query: row.query,
      page: row.page,
      position: row.position,
      impressions: row.impressions,
      clicksAtStake: Math.round(row.missedClicks),
      detail:
        "Ranks well but under-clicked — check the live results, then the title and meta",
    });
  }

  for (const row of input.cannibalization) {
    const winner = row.pages.find((page) => page.isWinner) ?? row.pages[0];
    if (!winner) continue;
    standalone.push({
      kind: "consolidate",
      query: row.query,
      page: winner.page,
      // Cannibalization rows are query-level; position lives per page, and
      // the winner's rank is what a merge would improve.
      position: 0,
      impressions: row.totalImpressions,
      clicksAtStake: Math.round(
        row.totalImpressions *
          row.splitShare *
          CONSOLIDATION_RECOVERY *
          TARGET_CTR,
      ),
      detail: `${row.pages.length} pages competing — consolidate into one`,
    });
  }

  for (const candidate of overlapping) merge(candidate);

  return [...byTarget.values(), ...standalone]
    .filter(
      (item) => item.clicksAtStake >= 1 && item.impressions >= MIN_IMPRESSIONS,
    )
    .toSorted(
      (a, b) =>
        b.clicksAtStake - a.clicksAtStake || b.impressions - a.impressions,
    );
}

/**
 * Drops rows whose query belongs to a customer this client does not have.
 *
 * Dropped, not demoted, for the reason the Keyword Trends action list gives
 * (opportunityActions.ts): every row here is an instruction to go do work, and
 * no version of "improve this page" is correct for somebody else's customer.
 * The Keyword Research table demotes instead, because there the user is
 * browsing rather than being told what to do. It also keeps the "Clicks at
 * stake" headline honest -- summing traffic the client does not want is worse
 * than merely listing it.
 *
 * The count comes back so the caller can say what it left out. A list that
 * silently shortens itself is indistinguishable from one with nothing in it,
 * and the verdicts come from rules the user wrote and can be wrong.
 *
 * The guarantee is only as good as the profile: with none confirmed the fit map
 * is empty and nothing is dropped. That is the honest failure mode -- an
 * unfiltered list rather than a falsely confident one.
 *
 * Generic over `{ query }` rather than `Opportunity` because Link
 * Opportunities makes the same call about the same GSC queries: an internal
 * link built toward an off-offer query entrenches the wrong page.
 */
export function excludeWrongCustomer<T extends { query: string }>(
  rows: readonly T[],
  fit: ReadonlyMap<string, FitResult>,
): { kept: T[]; excluded: number } {
  const kept = rows.filter(
    (row) => fit.get(row.query)?.verdict !== "wrong-customer",
  );
  return { kept, excluded: rows.length - kept.length };
}

/** Lowercase the first character so a merged detail reads as one sentence. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Identity of a thing worth fixing. Two signals about the same query on the
 *  same page are one opportunity, not two. */
function keyOf(query: string, page: string): string {
  return `${query}\n${page}`;
}

/**
 * Sub-caption for the headline "Opportunities" tile: how many of the total
 * are the cheapest kind to act on (already ranking, just short of the top
 * 3) -- the raw count alone says nothing about the effort mix behind it.
 * Silent when there's nothing to break down (zero opportunities) or when
 * the breakdown would just repeat the headline number (every opportunity is
 * already a quick win), mirroring why a GBP score with no unknowns gets no
 * "10 of 10" hint either.
 */
export function quickWinHint(opportunities: Opportunity[]): string | undefined {
  const total = opportunities.length;
  if (total === 0) return undefined;
  const quickWins = opportunities.filter(
    (item) => item.kind === "quick-win",
  ).length;
  if (quickWins === total) return undefined;
  return `${quickWins} quick win${quickWins === 1 ? "" : "s"}`;
}

type TechnicalIssueKey = "status" | "title" | "meta" | "h1" | "thin" | "alt";

type TechnicalIssue = {
  key: TechnicalIssueKey;
  label: string;
  description: string;
  severity: "high" | "medium" | "low";
  pageCount: number;
  /** A few affected URLs, for the "show me" case. */
  examples: string[];
};

type AuditPageRow = {
  url: string;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number;
  imagesMissingAlt: number;
};

const THIN_CONTENT_WORDS = 300;
const EXAMPLE_LIMIT = 3;

/**
 * Group crawled pages into the classic on-page problems. Counts come from
 * pages already stored by the last audit, so this costs nothing to show.
 */
export function buildTechnicalIssues(pages: AuditPageRow[]): TechnicalIssue[] {
  const definitions: Array<{
    key: TechnicalIssueKey;
    label: string;
    description: string;
    severity: TechnicalIssue["severity"];
    matches: (page: AuditPageRow) => boolean;
  }> = [
    {
      key: "status",
      label: "Pages not returning 200",
      description: "Broken or redirecting URLs Google may drop from the index",
      severity: "high",
      matches: (page) => page.statusCode != null && page.statusCode >= 300,
    },
    {
      key: "title",
      label: "Missing page title",
      description: "The single strongest on-page signal, absent",
      severity: "high",
      matches: (page) => (page.title ?? "").trim() === "",
    },
    {
      key: "meta",
      label: "Missing meta description",
      description: "Google writes its own snippet — you lose the pitch",
      severity: "medium",
      matches: (page) => (page.metaDescription ?? "").trim() === "",
    },
    {
      key: "h1",
      label: "Missing or duplicate H1",
      description: "Each page should state its topic once, clearly",
      severity: "medium",
      matches: (page) => page.h1Count !== 1,
    },
    {
      key: "thin",
      label: "Thin content",
      description: `Under ${THIN_CONTENT_WORDS} words — usually too little to rank`,
      severity: "medium",
      matches: (page) =>
        page.wordCount > 0 && page.wordCount < THIN_CONTENT_WORDS,
    },
    {
      key: "alt",
      label: "Images without alt text",
      description: "Accessibility and image-search misses",
      severity: "low",
      matches: (page) => page.imagesMissingAlt > 0,
    },
  ];

  return definitions
    .map((definition) => {
      const affected = pages.filter(definition.matches);
      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        severity: definition.severity,
        pageCount: affected.length,
        examples: affected.slice(0, EXAMPLE_LIMIT).map((page) => page.url),
      };
    })
    .filter((issue) => issue.pageCount > 0)
    .toSorted((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[a.severity] - rank[b.severity] || b.pageCount - a.pageCount;
    });
}

/**
 * Is a GSC-derived source MISSING rather than empty?
 *
 * A disconnected Search Console is not an error -- the server function succeeds
 * with { connected: false } -- so an isError-only check let the Opportunities
 * tiles render a confident "0 opportunities / 0 clicks at stake" for a project
 * with no Search Console data at all. Zero is a finding; absent data is not.
 *
 * Pending counts as unavailable too: "--" settling into a number reads better
 * than "0" correcting itself upward.
 */
export function isSourceUnavailable(
  query: { isError: boolean; isPending: boolean },
  data: { connected: boolean } | undefined,
): boolean {
  return query.isError || query.isPending || data?.connected === false;
}
