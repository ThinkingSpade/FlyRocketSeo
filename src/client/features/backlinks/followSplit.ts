/**
 * Dofollow vs nofollow split, derived from the summary call the overview
 * already makes. DataForSEO reports only the nofollow side, so the dofollow
 * count is a subtraction.
 */

type FollowSplit = {
  dofollow: number;
  nofollow: number;
  total: number;
  /** Share of referring domains that pass authority, 0-1. */
  dofollowShare: number;
  /** How the share reads against a typical profile. */
  verdict: "healthy" | "nofollow-heavy" | "unusually-clean";
  note: string;
};

/**
 * Most real link profiles land somewhere around two thirds dofollow. Below
 * `NOFOLLOW_HEAVY_SHARE` the profile is passing much less authority than its
 * headline count suggests; above `SUSPICIOUSLY_CLEAN_SHARE` the near-total
 * absence of nofollow is itself worth a look, since organic profiles almost
 * always pick up some nofollow links from social and forums.
 */
const NOFOLLOW_HEAVY_SHARE = 0.5;
const SUSPICIOUSLY_CLEAN_SHARE = 0.97;

export function computeFollowSplit(
  total: number | null,
  nofollow: number | null,
): FollowSplit | null {
  if (total == null || total <= 0 || nofollow == null || nofollow < 0) {
    return null;
  }
  // A nofollow count above the total would be provider noise; clamping keeps
  // the bar from rendering a negative dofollow segment.
  const clampedNofollow = Math.min(nofollow, total);
  const dofollow = total - clampedNofollow;
  const dofollowShare = dofollow / total;

  return {
    dofollow,
    nofollow: clampedNofollow,
    total,
    dofollowShare,
    ...describeSplit(dofollowShare),
  };
}

function describeSplit(dofollowShare: number): {
  verdict: FollowSplit["verdict"];
  note: string;
} {
  const percent = Math.round(dofollowShare * 100);

  if (dofollowShare < NOFOLLOW_HEAVY_SHARE) {
    return {
      verdict: "nofollow-heavy",
      note: `Only ${percent}% of referring domains pass authority — the headline backlink count overstates how much ranking value this profile carries.`,
    };
  }
  if (dofollowShare >= SUSPICIOUSLY_CLEAN_SHARE) {
    return {
      verdict: "unusually-clean",
      note: `${percent}% dofollow is higher than an organic profile usually reaches — worth checking that the links were earned rather than placed.`,
    };
  }
  return {
    verdict: "healthy",
    note: `${percent}% of referring domains pass authority, which is a normal mix.`,
  };
}
