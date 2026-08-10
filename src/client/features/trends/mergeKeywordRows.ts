import type { KeywordDiscoveryKeyword } from "@/types/schemas/keyword-discovery";
import type {
  OpportunityAction,
  TrendingOpportunity,
} from "./opportunityActions";
import type { QueryMomentum } from "./queryMomentum";

/**
 * Merges the tab's two keyword sources into one table.
 *
 * THE TWO RANK NUMBERS STAY IN SEPARATE FIELDS, and that is the load-bearing
 * property of this module. Search Console's `position` is a property-level
 * AVERAGE across every impression and names no URL -- trendingOpportunities.ts
 * already warns it "must never be presented as 'that page ranks #N'". Labs'
 * `rank_absolute` is a point-in-time SERP position for one specific URL.
 * Averaging them, or falling back from one to the other in a single field,
 * produces a number that describes nothing real. The UI picks which to show
 * and labels it; this function refuses to decide by blending.
 *
 * Low-impression GSC rows are KEPT here. They arrive with
 * `direction: "unknown"` and `action: "watch"` (see queryMomentum.ts's
 * MIN_IMPRESSIONS_FOR_VERDICT), which the old card filtered out via
 * `isActionable` -- that filter is why a real site showed three rows. The
 * floor still governs what we CLAIM about a row; it no longer governs whether
 * the row exists.
 */

export type KeywordTargetRow = {
  keyword: string;
  /** Labs `rank_absolute`, or null when only Search Console knows this term. */
  serpRank: number | null;
  /** GSC property-level average position, or null when GSC has no row. */
  gscAveragePosition: number | null;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  traffic: number | null;
  url: string | null;
  impressions: number | null;
  /** Null for a Labs-only keyword: GSC has nothing to say about a term the
   *  site gets no impressions for, and an empty cell says so more honestly
   *  than a zero would. */
  momentum: QueryMomentum | null;
  /** Null for a Labs-only keyword -- every verdict in opportunityActions.ts
   *  is derived from impressions and position together. */
  action: OpportunityAction | null;
  reason: string | null;
};

/** Match key. Trimmed and lowercased because the two providers disagree about
 *  both: GSC returns queries as typed, Labs normalizes. */
function matchKey(keyword: string): string {
  return keyword.trim().toLowerCase();
}

export function mergeKeywordRows(input: {
  gsc: readonly TrendingOpportunity[];
  labs: readonly KeywordDiscoveryKeyword[];
}): KeywordTargetRow[] {
  const rows = new Map<string, KeywordTargetRow>();

  for (const item of input.labs) {
    const key = matchKey(item.keyword);
    if (key === "") continue;
    rows.set(key, {
      keyword: item.keyword.trim(),
      serpRank: item.position,
      gscAveragePosition: null,
      searchVolume: item.searchVolume,
      keywordDifficulty: item.keywordDifficulty,
      cpc: item.cpc,
      traffic: item.traffic,
      url: item.url,
      impressions: null,
      momentum: null,
      action: null,
      reason: null,
    });
  }

  for (const item of input.gsc) {
    const key = matchKey(item.keyword);
    if (key === "") continue;
    const existing = rows.get(key);
    rows.set(key, {
      keyword: existing?.keyword ?? item.keyword.trim(),
      serpRank: existing?.serpRank ?? null,
      gscAveragePosition: item.position,
      searchVolume: existing?.searchVolume ?? null,
      keywordDifficulty: existing?.keywordDifficulty ?? null,
      cpc: existing?.cpc ?? null,
      traffic: existing?.traffic ?? null,
      // Labs names the ranking URL exactly; GSC's dominant page is a share
      // estimate, so it is only used when Labs has no row at all.
      url: existing?.url ?? item.page,
      impressions: item.momentum.impressions,
      momentum: item.momentum,
      action: item.action,
      reason: item.reason,
    });
  }

  // Volume descending, unknown volume last: the table answers "what is worth
  // targeting", and volume is the only column here that describes the market
  // rather than this site. Rows with no volume are GSC-only -- an anonymised
  // or very fresh query Labs has not picked up -- and belong below the rows
  // we can actually size. Impressions break ties so two unsized rows still
  // order sensibly.
  return [...rows.values()].toSorted((a, b) => {
    const volumeA = a.searchVolume ?? -1;
    const volumeB = b.searchVolume ?? -1;
    if (volumeA !== volumeB) return volumeB - volumeA;
    return (b.impressions ?? 0) - (a.impressions ?? 0);
  });
}
