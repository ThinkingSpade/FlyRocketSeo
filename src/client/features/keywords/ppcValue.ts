import type { KeywordResearchRow } from "@/types/keywords";

/**
 * The PPC lens on keyword research: what this traffic would cost to buy, and
 * whether buying or ranking is the better bet.
 *
 * Every input is already on the rows the tab fetched — search volume, CPC and
 * keyword difficulty — so this costs nothing extra. It exists because those
 * three numbers sitting in separate columns don't answer the question people
 * actually have: "is this worth paying for, or should I earn it?"
 */

type PpcKeyword = {
  keyword: string;
  searchVolume: number;
  cpc: number;
  keywordDifficulty: number | null;
  /** What a month of this keyword's clicks would cost at its CPC. */
  monthlyCostUsd: number;
  verdict: PpcVerdict;
};

/**
 * - `rank-it`   expensive per click, but not hard to rank — earning it pays back
 * - `buy-it`    cheap per click and hard to rank — paying is the shortcut
 * - `balanced`  neither lever is obviously better
 */
export type PpcVerdict = "rank-it" | "buy-it" | "balanced";

/**
 * Share of impressions that become clicks for a top organic/ad position. Used
 * only to size the cost comparison, never presented as a traffic forecast.
 */
const ASSUMED_CTR = 0.25;

/** Above this CPC a click is expensive enough that earning it is worth effort. */
const EXPENSIVE_CPC = 3;
/** Below this difficulty, ranking is realistic rather than a multi-year project. */
const WINNABLE_DIFFICULTY = 40;

function estimateMonthlyPpcCost(volume: number, cpc: number): number {
  return volume * ASSUMED_CTR * cpc;
}

function verdictFor(cpc: number, difficulty: number | null): PpcVerdict {
  if (difficulty == null) return "balanced";
  if (cpc >= EXPENSIVE_CPC && difficulty <= WINNABLE_DIFFICULTY)
    return "rank-it";
  if (cpc < EXPENSIVE_CPC && difficulty > WINNABLE_DIFFICULTY) return "buy-it";
  return "balanced";
}

/**
 * Rows worth a PPC decision, most expensive traffic first. Keywords with no
 * volume or no CPC are dropped: without both, there is no cost to reason about
 * and a zero would read as "free" rather than "unknown".
 */
export function buildPpcKeywords(
  rows: readonly KeywordResearchRow[],
  limit: number,
): PpcKeyword[] {
  return rows
    .flatMap((row) => {
      const volume = row.searchVolume ?? 0;
      const cpc = row.cpc ?? 0;
      if (volume <= 0 || cpc <= 0) return [];
      return [
        {
          keyword: row.keyword,
          searchVolume: volume,
          cpc,
          keywordDifficulty: row.keywordDifficulty,
          monthlyCostUsd: estimateMonthlyPpcCost(volume, cpc),
          verdict: verdictFor(cpc, row.keywordDifficulty),
        },
      ];
    })
    .toSorted(
      (a, b) =>
        b.monthlyCostUsd - a.monthlyCostUsd ||
        a.keyword.localeCompare(b.keyword),
    )
    .slice(0, limit);
}

/** Total monthly spend the surfaced keywords would represent if bought. */
export function totalMonthlyCost(keywords: readonly PpcKeyword[]): number {
  return keywords.reduce((sum, keyword) => sum + keyword.monthlyCostUsd, 0);
}
