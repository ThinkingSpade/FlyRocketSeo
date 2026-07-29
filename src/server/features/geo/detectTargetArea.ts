import type { TargetArea } from "@/shared/geo/types";

/**
 * The detection cascade (Task 3 of
 * docs/superpowers/plans/2026-07-28-local-geo-targeting-activation.md):
 * ranks free signals into a single target-area proposal, or null.
 *
 * PURE, no I/O, no repository import. Mapping a raw signal (a GBP city, a
 * Search-Console local-landing-page slug) to a seeded `geo_locations` row is
 * itself a D1 lookup -- the CALLER (TargetAreaService) does that and hands
 * this module already-resolved `TargetArea` candidates. This mirrors
 * GeoLocationRepository's own "reads only, reads D1 only" boundary from the
 * other side: that file must never reach a metered provider, and this file
 * must never reach D1 -- otherwise it could not load under Vitest's
 * `environment: "node"` alongside every other pure module in this codebase.
 */

export type DetectTargetAreaInput = {
  /**
   * The business's own declared address, already resolved against
   * `geo_locations` by the caller. `null` covers two different real
   * situations identically ON PURPOSE: no cached Google Business Profile at
   * all, or a profile whose city didn't match any seeded row. Both mean
   * "GBP has nothing usable to contribute", and this module must never
   * guess which one it was, or invent a code either way.
   */
  gbpCandidate: TargetArea | null;
  /**
   * Areas the caller resolved from Search Console local-landing-page
   * evidence (`getLocalLandingPages`), most-confident first (e.g. the
   * caller's own impressions-descending order) -- de-duping by
   * `locationCode` is this module's job, not the caller's, since several
   * evidence rows (pages, queries) can legitimately resolve to the same
   * area. Empty covers "no GSC connection", "no local evidence", and "none
   * of it resolved to a seeded row" identically, for the same reason as
   * `gbpCandidate` above.
   */
  gscCandidates: readonly TargetArea[];
};

export type TargetAreaProposal =
  | {
      multi: false;
      area: TargetArea;
      source: "gbp" | "gsc";
      /**
       * Set only when GBP won this proposal AND at least one GSC candidate
       * named a DIFFERENT location -- lets the confirmation banner say so
       * without re-deriving the comparison itself. Null whenever GBP and
       * GSC agree, GSC had nothing to say, or the proposal is GSC-sourced in
       * the first place (nothing to disagree with itself).
       */
      gscDisagreement: TargetArea | null;
    }
  | {
      multi: true;
      /** Every distinct area GSC evidence named, most-confident first. */
      areas: readonly TargetArea[];
      source: "gsc";
    };

function sameArea(a: TargetArea, b: TargetArea): boolean {
  return a.locationCode === b.locationCode;
}

/** First-occurrence-order de-dup by `locationCode`. "Several distinct
 *  cities" must count locations, not raw evidence rows -- two landing pages
 *  that both resolve to Plano are one area, not two. */
function dedupeAreas(areas: readonly TargetArea[]): TargetArea[] {
  const distinct: TargetArea[] = [];
  for (const area of areas) {
    if (!distinct.some((existing) => sameArea(existing, area))) {
      distinct.push(area);
    }
  }
  return distinct;
}

/**
 * Highest confidence first, per the spec: the cached Google Business Profile
 * wins outright whenever the caller resolved one, and only when it produced
 * nothing does Search Console evidence get a say -- including its own
 * multi-location case, offered only because detection actually found
 * several distinct areas, never manufactured for a single-location business.
 */
export function detectTargetArea(
  input: DetectTargetAreaInput,
): TargetAreaProposal | null {
  const { gbpCandidate, gscCandidates } = input;

  if (gbpCandidate) {
    const gscDisagreement =
      gscCandidates.find((candidate) => !sameArea(candidate, gbpCandidate)) ??
      null;
    return {
      multi: false,
      area: gbpCandidate,
      source: "gbp",
      gscDisagreement,
    };
  }

  const [first, ...rest] = dedupeAreas(gscCandidates);
  if (!first) return null; // Neither signal produced anything -- no guess.
  if (rest.length === 0) {
    return { multi: false, area: first, source: "gsc", gscDisagreement: null };
  }
  return { multi: true, areas: [first, ...rest], source: "gsc" };
}
