// Pure portfolio aggregates for the Saved Keywords strip (no I/O), split
// out so the math is unit-testable.

type SavedPortfolioInput = {
  searchVolume: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
};

type SavedPortfolio = {
  keywordCount: number;
  totalVolume: number;
  averageDifficulty: number | null;
  /** Keywords with known KD under 30 and some volume — the low-hanging set. */
  quickWins: number;
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

export function computeSavedPortfolio(
  rows: SavedPortfolioInput[],
): SavedPortfolio {
  let totalVolume = 0;
  let difficultySum = 0;
  let difficultyCount = 0;
  let quickWins = 0;
  const intentCounts = new Map<string, number>();

  for (const row of rows) {
    totalVolume += row.searchVolume ?? 0;
    if (row.keywordDifficulty != null) {
      difficultySum += row.keywordDifficulty;
      difficultyCount += 1;
      if (
        row.keywordDifficulty < QUICK_WIN_MAX_KD &&
        (row.searchVolume ?? 0) > 0
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
    intentMix: INTENT_ORDER.filter((intent) => intentCounts.has(intent)).map(
      (intent) => ({ intent, count: intentCounts.get(intent) ?? 0 }),
    ),
  };
}
