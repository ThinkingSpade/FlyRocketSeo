// Pure severity scoring for cannibalization rows (no I/O), split out so
// the ranking rules are unit-testable.

type CompetingPage = {
  clicks: number;
  impressions: number;
};

type CannibalizationInput = {
  totalClicks: number;
  totalImpressions: number;
  pages: CompetingPage[];
};

export type CannibalizationSeverity = "high" | "medium" | "low";

type ScoredCannibalization<T> = T & {
  severity: CannibalizationSeverity;
  /** 0..1 — how evenly traffic splits across the competing pages. */
  splitShare: number;
};

/** How much of the query's traffic the leading page does NOT capture.
 *  0 = one page takes everything (mild); towards 1 = an even split (bad).
 *  Falls back to impressions when the query gets no clicks yet. */
function computeSplitShare(row: CannibalizationInput): number {
  const byClicks = row.totalClicks > 0;
  const total = byClicks ? row.totalClicks : row.totalImpressions;
  if (total <= 0) return 0;
  const leader = Math.max(
    0,
    ...row.pages.map((page) => (byClicks ? page.clicks : page.impressions)),
  );
  return Math.max(0, 1 - leader / total);
}

/** An even split on a high-impression query is the urgent kind; thresholds
 *  weigh the split by impressions so tiny queries stay low-key. */
function classify(
  splitShare: number,
  totalImpressions: number,
): CannibalizationSeverity {
  const weighted = splitShare * totalImpressions;
  if (splitShare >= 0.35 && weighted >= 100) return "high";
  if (splitShare >= 0.2 || weighted >= 40) return "medium";
  return "low";
}

/** Score and sort rows, worst splits first. */
export function scoreCannibalization<T extends CannibalizationInput>(
  rows: T[],
): Array<ScoredCannibalization<T>> {
  return rows
    .map((row) => {
      const splitShare = computeSplitShare(row);
      return {
        ...row,
        splitShare,
        severity: classify(splitShare, row.totalImpressions),
      };
    })
    .toSorted(
      (a, b) =>
        b.splitShare * b.totalImpressions - a.splitShare * a.totalImpressions,
    );
}
