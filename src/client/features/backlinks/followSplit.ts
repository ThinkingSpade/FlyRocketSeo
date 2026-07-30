/**
 * How much of the referring-domain count carries nofollow links, derived from
 * the summary call the overview already makes.
 *
 * DataForSEO's `referring_domains_nofollow` counts domains that point **at
 * least one** nofollow link at the target. It is not a separate population from
 * the total: a domain linking twice, once dofollow and once nofollow, is
 * counted in both numbers. So `total - nofollow` is *not* the number of domains
 * passing authority, and this deliberately does not claim it is — it reports
 * the overlap DataForSEO actually measured.
 */

type NofollowExposure = {
  /** Referring domains with at least one nofollow link. */
  nofollow: number;
  total: number;
  /** Share of referring domains touched by nofollow, 0-1. */
  nofollowShare: number;
  /**
   * Domains with no nofollow link at all — a floor on how many pass authority,
   * since the rest may still pass it through their other links.
   */
  cleanDofollow: number;
  verdict: "healthy" | "nofollow-heavy" | "unusually-clean";
  note: string;
};

/**
 * Past this share, enough of the profile is touched by nofollow that the
 * headline referring-domain count oversells it. Below the clean threshold, the
 * near-total absence of nofollow is itself worth a look: organic profiles pick
 * up nofollow links from social, forums and news comments.
 */
const NOFOLLOW_HEAVY_SHARE = 0.5;
const SUSPICIOUSLY_CLEAN_SHARE = 0.03;

export function computeNofollowExposure(
  total: number | null,
  nofollow: number | null,
): NofollowExposure | null {
  if (total == null || total <= 0 || nofollow == null || nofollow < 0) {
    return null;
  }
  // A nofollow count above the total would be provider noise; clamping keeps
  // the bar from rendering a negative segment.
  const clampedNofollow = Math.min(nofollow, total);
  const nofollowShare = clampedNofollow / total;

  return {
    nofollow: clampedNofollow,
    total,
    nofollowShare,
    cleanDofollow: total - clampedNofollow,
    ...describeExposure(nofollowShare),
  };
}

function describeExposure(nofollowShare: number): {
  verdict: NofollowExposure["verdict"];
  note: string;
} {
  const percent = Math.round(nofollowShare * 100);

  if (nofollowShare >= NOFOLLOW_HEAVY_SHARE) {
    return {
      verdict: "nofollow-heavy",
      // Stops at what the provider measured. The old ending -- "the headline
      // count still overstates how much authority reaches this site" -- does not
      // follow: if every one of those domains ALSO sends a followed link, which
      // this field cannot rule out, then every domain passes authority and the
      // headline count overstates nothing. Judging that needs followed-only or
      // link-level data we do not have here.
      note: `${percent}% of referring domains send at least one nofollow link. This field counts domains touched by nofollow, not nofollow-only domains, so it does not say how many pass no authority — check the link-level view before concluding.`,
    };
  }
  if (nofollowShare <= SUSPICIOUSLY_CLEAN_SHARE) {
    return {
      verdict: "unusually-clean",
      note: `Almost no referring domain sends a nofollow link. Organic profiles normally pick some up from social and forums, so it is worth checking these links were earned rather than placed.`,
    };
  }
  return {
    verdict: "healthy",
    note: `${percent}% of referring domains send at least one nofollow link, which is a normal mix.`,
  };
}
