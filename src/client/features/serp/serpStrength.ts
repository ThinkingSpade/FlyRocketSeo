// Pure SERP-strength math for the SERP Overview summary (no I/O), split out
// so the aggregation is unit-testable.

export type SerpStrengthInput = {
  rank: number | null;
  domain: string | null;
  domainEtv: number | null;
};

type SerpStrength = {
  /** Average Ahrefs DR of top-10 results with a known rating. */
  averageDr: number | null;
  /** Median whole-domain traffic across top-10 results with a value. */
  medianDomainTraffic: number | null;
  /** Top-10 results with DR < 30 — realistic displacement slots. */
  softSpots: number;
  /** The lowest-DR top-10 result: your easiest target. */
  weakest: { rank: number; domain: string; dr: number } | null;
};

const SOFT_SPOT_DR = 30;

/** Aggregate loaded results + DR ratings into a strength read of the top 10. */
export function computeSerpStrength(
  results: SerpStrengthInput[],
  ratings: Record<string, number | null> | null,
): SerpStrength {
  const top10 = results.filter((item) => item.rank != null && item.rank <= 10);

  const rated: Array<{ rank: number; domain: string; dr: number }> = [];
  for (const item of top10) {
    const dr = item.domain != null ? (ratings?.[item.domain] ?? null) : null;
    if (dr != null && item.rank != null && item.domain != null) {
      rated.push({ rank: item.rank, domain: item.domain, dr });
    }
  }

  const traffics = top10
    .map((item) => item.domainEtv)
    .filter((value): value is number => value != null)
    .toSorted((a, b) => a - b);
  const medianDomainTraffic =
    traffics.length === 0
      ? null
      : traffics.length % 2 === 1
        ? traffics[(traffics.length - 1) / 2]
        : (traffics[traffics.length / 2 - 1] + traffics[traffics.length / 2]) /
          2;

  const weakest = rated.toSorted((a, b) => a.dr - b.dr || b.rank - a.rank)[0];

  return {
    averageDr:
      rated.length > 0
        ? Math.round(
            rated.reduce((sum, item) => sum + item.dr, 0) / rated.length,
          )
        : null,
    medianDomainTraffic,
    softSpots: rated.filter((item) => item.dr < SOFT_SPOT_DR).length,
    weakest: weakest ?? null,
  };
}
