import type {
  CompetitorRow,
  CompetitorsPage,
} from "@/types/schemas/competitors";
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

/**
 * Re-applies this project's CURRENT pin/exclude overrides to an already-built
 * page, replacing whatever `rows`/`hiddenCount` it carried. Every other field
 * (`fetchedAt`, `seedSize`, `discoveryMode`, ...) is preserved untouched.
 *
 * For this to be safe to call more than once against data that keeps getting
 * read back (an R2 cache hit, or a restored past run), `page.rows` MUST be
 * the pristine, un-overridden discovery result -- never a PRIOR
 * `applyProjectCompetitors` output. `applyProjectCompetitors` only ever
 * REMOVES a row it finds already excluded and ADDS one for a pin discovery
 * missed; it has no way to un-pin a row or drop a placeholder it already
 * added, because by the time it runs again it cannot tell "the vendor
 * returned this with every metric null" apart from "a prior pass fabricated
 * this because it was pinned then." A stale `pinned: true` would stick
 * forever, and an unpinned placeholder row (all-null metrics) would become a
 * permanent ghost competitor. `CompetitorsService` avoids this at the source:
 * both discovery paths cache/record `rows` exactly as the vendor (or the
 * domain-overlap mapper) produced them, with pins/exclusions applied only to
 * the copy returned to the caller -- so every call in here always starts from
 * the same pristine base, and reapplying is a pure, idempotent view.
 */
export function reapplyProjectCompetitors(
  page: CompetitorsPage,
  overrides: ProjectCompetitorRow[],
): CompetitorsPage {
  const applied = applyProjectCompetitors(page.rows, overrides);
  return { ...page, rows: applied.rows, hiddenCount: applied.hiddenCount };
}
