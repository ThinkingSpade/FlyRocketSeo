import type { CompetitorRow, DiscoveryMode } from "@/types/schemas/competitors";

/** One bubble's plot data -- render-only concerns (fill color) are added by
 *  the component, not decided here. */
export type PositioningMapBubble = {
  domain: string;
  keywords: number;
  traffic: number;
  overlap: number;
  isTarget: boolean;
};

// Not exported: callers (the component, and this file's own test) only ever
// narrow on `.kind`, never need to name the union itself.
type PositioningMapResult =
  | { kind: "chart"; bubbles: PositioningMapBubble[] }
  /** Serp-mode discovery: the axes this chart needs are not measured. */
  | { kind: "unavailable" }
  /** Domain-mode discovery, but fewer than 2 plottable points. */
  | { kind: "insufficient" };

/** Bubble size range and the sentinel color are the component's concern;
 *  this only decides how many bubbles fit before the chart gets unreadable. */
const MAX_BUBBLES = 8;

/**
 * Decides whether the competitive-positioning scatter (site-wide organic
 * keywords vs. organic traffic) can be drawn honestly, and if so, from which
 * rows.
 *
 * "domain" mode only. On a serp-sourced row, `organicKeywords`/`organicTraffic`
 * are scoped to the run's SEED (DataForSEO's `serp_competitors` counts only
 * matches against the keyword list this run sent, capped at
 * `COMPETITOR_SEED_SIZE` = 40) -- not the domain's real site-wide footprint.
 * `rankSerpCompetitors.ts`'s own `intersections: null` comment says the same
 * about that field, for the same reason: "Only meaningful for the
 * domain-overlap endpoint; this path has none."
 *
 * Plotting seed-scoped rival numbers on the same axes as the target's
 * site-wide domain-overview bubble would put a rival capped at ~40 keywords
 * next to a target with thousands, and every bubble would collapse to
 * minimum size once `overlap` (`intersections`, also always null in serp
 * mode) is read as `0` for all of them. There is no honest rescale for a
 * seed-scoped count onto a site-wide axis, so serp-mode discovery gets
 * `{ kind: "unavailable" }` -- an explanatory empty state -- instead of a
 * chart that plots incomparable quantities against each other.
 */
export function buildPositioningMapBubbles(input: {
  rows: CompetitorRow[];
  discoveryMode: DiscoveryMode;
  /** The target's own site-wide domain overview, when the caller has
   *  restored one for the SAME domain currently on screen. */
  overview: {
    domain: string;
    hasData: boolean;
    organicKeywords: number | null;
    organicTraffic: number | null;
  } | null;
}): PositioningMapResult {
  if (input.discoveryMode === "serp") {
    return { kind: "unavailable" };
  }

  const competitors: PositioningMapBubble[] = input.rows
    .filter((row) => row.organicKeywords != null && row.organicTraffic != null)
    .toSorted((a, b) => (b.intersections ?? 0) - (a.intersections ?? 0))
    .slice(0, MAX_BUBBLES)
    .map((row) => ({
      domain: row.domain,
      keywords: row.organicKeywords ?? 0,
      traffic: row.organicTraffic ?? 0,
      overlap: row.intersections ?? 0,
      isTarget: false,
    }));

  const overview = input.overview;
  if (
    overview?.hasData &&
    overview.organicKeywords != null &&
    overview.organicTraffic != null
  ) {
    const maxOverlap = Math.max(1, ...competitors.map((c) => c.overlap));
    competitors.push({
      domain: `${overview.domain} (you)`,
      keywords: overview.organicKeywords,
      traffic: overview.organicTraffic,
      overlap: maxOverlap,
      isTarget: true,
    });
  }

  return competitors.length < 2
    ? { kind: "insufficient" }
    : { kind: "chart", bubbles: competitors };
}
