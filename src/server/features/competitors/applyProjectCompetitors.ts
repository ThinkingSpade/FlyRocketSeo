import type { CompetitorRow } from "@/types/schemas/competitors";
import type { ProjectCompetitorRow } from "./repositories/ProjectCompetitorRepository";

/**
 * Folds an operator's standing corrections into a discovery result.
 *
 * A pinned domain discovery missed is added with NULL metrics rather than
 * zeros: we have no measurement for it, and a zero would read as "this rival
 * beats you on nothing", which is a different and false claim.
 */
export function applyProjectCompetitors(
  rows: CompetitorRow[],
  overrides: ProjectCompetitorRow[],
): { rows: CompetitorRow[]; hiddenCount: number } {
  const excluded = new Set(
    overrides.filter((o) => o.status === "excluded").map((o) => o.domain),
  );
  // Exclusion wins over pinning: it is the more specific instruction, and a
  // domain in both states is an operator mistake we must not resolve loudly.
  const pinned = new Set(
    overrides
      .filter((o) => o.status === "pinned" && !excluded.has(o.domain))
      .map((o) => o.domain),
  );

  const kept: CompetitorRow[] = [];
  let hiddenCount = 0;
  const seen = new Set<string>();

  for (const row of rows) {
    if (excluded.has(row.domain)) {
      hiddenCount += 1;
      continue;
    }
    seen.add(row.domain);
    kept.push(pinned.has(row.domain) ? { ...row, pinned: true } : row);
  }

  for (const domain of pinned) {
    if (seen.has(domain)) continue;
    kept.push({
      domain,
      avgPosition: null,
      intersections: null,
      organicKeywords: null,
      organicTraffic: null,
      coverage: null,
      beatsYouCount: null,
      positionDelta: null,
      source: "serp",
      pinned: true,
    });
  }

  kept.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return { rows: kept, hiddenCount };
}
