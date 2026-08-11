// Pure portfolio aggregates for the Saved Keywords strip (no I/O), split
// out so the math is unit-testable.

import type { FitResult } from "@/shared/keyword-fit/keywordFit";

type SavedPortfolioInput = {
  keyword: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
};

type SavedPortfolio = {
  keywordCount: number;
  totalVolume: number;
  averageDifficulty: number | null;
  /**
   * Keywords with known KD under 30, some volume, and no verdict against
   * them. "Easy to rank for" is not the same claim as "worth ranking for",
   * and this tile is the only place the tab says a saved list is healthy.
   */
  quickWins: number;
  /** Saved keywords the profile says belong to someone else's customer. */
  offTarget: number;
  /** Canonical-order intent mix over rows with a known intent. */
  intentMix: Array<{ intent: string; count: number }>;
};

const QUICK_WIN_MAX_KD = 30;

const INTENT_ORDER = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
] as const;

/**
 * `fit` is empty whenever the project has no confirmed, usable profile (see
 * `useKeywordFit`), and an empty map rules nothing out -- so quick wins then
 * mean exactly what they meant before. The caller reads `fit.size` to decide
 * whether to describe the tile as fit-aware, rather than claiming a judgement
 * that was never made.
 */
export function computeSavedPortfolio(
  rows: SavedPortfolioInput[],
  fit: ReadonlyMap<string, FitResult> = new Map(),
): SavedPortfolio {
  let totalVolume = 0;
  let difficultySum = 0;
  let difficultyCount = 0;
  let quickWins = 0;
  let offTarget = 0;
  const intentCounts = new Map<string, number>();

  for (const row of rows) {
    totalVolume += row.searchVolume ?? 0;
    const wrongCustomer = fit.get(row.keyword)?.verdict === "wrong-customer";
    if (wrongCustomer) offTarget += 1;
    if (row.keywordDifficulty != null) {
      difficultySum += row.keywordDifficulty;
      difficultyCount += 1;
      if (
        row.keywordDifficulty < QUICK_WIN_MAX_KD &&
        (row.searchVolume ?? 0) > 0 &&
        !wrongCustomer
      ) {
        quickWins += 1;
      }
    }
    const intent = row.intent?.toLowerCase();
    if (intent && (INTENT_ORDER as readonly string[]).includes(intent)) {
      intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
    }
  }

  return {
    keywordCount: rows.length,
    totalVolume,
    averageDifficulty:
      difficultyCount > 0 ? Math.round(difficultySum / difficultyCount) : null,
    quickWins,
    offTarget,
    intentMix: INTENT_ORDER.filter((intent) => intentCounts.has(intent)).map(
      (intent) => ({ intent, count: intentCounts.get(intent) ?? 0 }),
    ),
  };
}
