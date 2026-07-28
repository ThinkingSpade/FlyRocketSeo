/**
 * Pure view-model shaping for `TargetAreaBanner.tsx`, split out so the
 * "which proposal shape produces which sentence" logic can live under
 * `src/**\/*.test.ts` (this repo's Vitest runs with `environment: "node"`
 * and collects only that pattern -- same reasoning `geoLocationOptions.ts`
 * already gives for its own split from `GeoLocationSelect.tsx`).
 *
 * Named distinctly from `TargetAreaBanner.tsx` (not just a case change) on
 * purpose: this project's own filesystem is case-insensitive (Windows), and
 * a `.ts`/`.tsx` pair differing only in case in the same directory resolves
 * ambiguously enough that `TargetAreaBanner.tsx`'s import of it degraded
 * silently to `any` under oxlint's type-aware checker (a real, observed
 * failure, not a hypothetical) -- `geoLocationOptions.ts` alongside
 * `GeoLocationSelect.tsx` avoids this the same way, by not being a bare case
 * swap of the component's own name.
 */
import type { TargetAreaResult } from "@/server/features/geo/services/TargetAreaService";
import type { TargetArea } from "@/shared/geo/types";

export type TargetAreaSource = "gbp" | "gsc";

export type TargetAreaBannerViewModel = {
  /**
   * The area to offer via "Use this for research". Already display-ready:
   * every `TargetArea.label` in this codebase is produced by
   * `toGeoDisplayName` at the point the area is BUILT (detection's
   * `resolveAreaForPlaceName`, or the picker's `geoLocationOptions.ts` group
   * builders) -- never a raw stored hierarchy string. Re-wrapping an
   * already-trimmed label in `toGeoDisplayName` a second time would be
   * actively wrong (its `DEFAULT_SEGMENTS_TO_DROP` assumes an un-trimmed
   * "City,State,Country" hierarchy and would eat the state segment off an
   * already-short "City, ST" label), so this field is rendered as-is.
   */
  area: TargetArea;
  source: TargetAreaSource;
  /**
   * How many additional distinct areas GSC evidence also named, for a
   * multi-location proposal. Zero for a `gbp` proposal (always single) and
   * for a single-area `gsc` proposal.
   */
  extraAreaCount: number;
  /**
   * Set only when GBP won the proposal AND at least one GSC candidate named
   * a different place -- see `detectTargetArea`'s own `TargetAreaProposal`
   * doc comment. Null whenever there is nothing to disagree with (GSC had no
   * say, agreed, or the proposal is GSC-sourced to begin with).
   */
  disagreement: TargetArea | null;
};

/**
 * Null whenever the banner must not render: no signal at all, or an area
 * already confirmed (the invariant this whole feature exists to protect --
 * see TargetAreaService.ts's own header on why `getTargetArea` can never
 * itself auto-confirm). A multi-location proposal collapses to its
 * most-confident area (`proposal.areas[0]`, already ordered that way by
 * `detectTargetArea`) so the banner keeps one shape either way; the
 * remaining areas surface only as a count, not a second confirm button --
 * picking a DIFFERENT one is what "Not right?" and the full picker are for.
 */
export function buildTargetAreaBannerViewModel(
  result: TargetAreaResult,
): TargetAreaBannerViewModel | null {
  if (!result || result.confirmed) return null;

  const { proposal } = result;
  if (!proposal.multi) {
    return {
      area: proposal.area,
      source: proposal.source,
      extraAreaCount: 0,
      disagreement: proposal.gscDisagreement,
    };
  }

  const [primary, ...rest] = proposal.areas;
  // detectTargetArea only ever returns `multi: true` alongside at least two
  // areas (its own single-area branch returns `multi: false`) -- but this
  // module must not lean on that invariant blindly. An empty `areas` array
  // here would be a genuine upstream detection bug; surfacing nothing is
  // safer than fabricating a banner for an area that doesn't exist.
  if (!primary) return null;

  return {
    area: primary,
    source: proposal.source,
    extraAreaCount: rest.length,
    disagreement: null,
  };
}

/** The sub-caption's source clause -- reads the proposal's own `source`
 *  rather than ever hardcoding "Google Business Profile", since a GSC-sourced
 *  proposal (no GBP at all) must not claim a profile that doesn't exist. */
export function describeTargetAreaSource(source: TargetAreaSource): string {
  return source === "gbp"
    ? "your Google Business Profile"
    : "your Search Console activity";
}

/** Null when there's nothing extra to mention, so the caller can render one
 *  optional clause rather than branching on the count itself. */
export function describeExtraAreas(extraAreaCount: number): string | null {
  if (extraAreaCount <= 0) return null;
  return `and ${extraAreaCount} more area${extraAreaCount === 1 ? "" : "s"}`;
}
