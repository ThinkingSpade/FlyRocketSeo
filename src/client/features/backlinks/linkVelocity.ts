import type { BacklinksOverviewResult } from "@/types/schemas/backlinks-results";

/**
 * Link velocity: is the profile growing or shrinking, and how fast.
 *
 * Derived entirely from the new/lost trend rows the overview already carries,
 * so this costs nothing extra. The headline number is the average NET
 * referring domains per month — gains minus losses — because a site winning
 * 40 and losing 38 a month is flat, not thriving, and the raw "new links"
 * count alone hides that.
 */

type LinkVelocity = {
  /** Average net referring domains gained per month over the window. */
  netPerMonth: number;
  gainedPerMonth: number;
  lostPerMonth: number;
  /** Months of data actually behind the averages. */
  months: number;
  direction: "growing" | "flat" | "shrinking";
  /** Net change in the most recent month, for the "latest vs typical" read. */
  latestNet: number | null;
};

/**
 * "Flat" has to be judged against how much the profile churns, not against a
 * fixed number: net +1/month is real growth for a site gaining 5 links a
 * month and pure noise for one gaining 400. A net move worth less than this
 * share of total churn is called flat.
 */
const FLAT_CHURN_SHARE = 0.05;
/** Floor so a very quiet profile doesn't get a near-zero threshold. */
const FLAT_FLOOR = 0.5;

export function computeLinkVelocity(
  trends: BacklinksOverviewResult["newLostTrends"],
): LinkVelocity | null {
  if (trends.length === 0) return null;

  let gained = 0;
  let lost = 0;
  // Months the provider has no figure for count as zero movement rather than
  // being dropped: a quiet month is real signal for a velocity average.
  for (const row of trends) {
    gained += row.newReferringDomains ?? 0;
    lost += row.lostReferringDomains ?? 0;
  }

  const months = trends.length;
  const gainedPerMonth = gained / months;
  const lostPerMonth = lost / months;
  const netPerMonth = gainedPerMonth - lostPerMonth;

  const latest = trends.at(-1);
  const latestNet =
    latest == null
      ? null
      : (latest.newReferringDomains ?? 0) - (latest.lostReferringDomains ?? 0);

  const flatBand = Math.max(
    FLAT_FLOOR,
    (gainedPerMonth + lostPerMonth) * FLAT_CHURN_SHARE,
  );

  return {
    netPerMonth,
    gainedPerMonth,
    lostPerMonth,
    months,
    latestNet,
    direction:
      netPerMonth > flatBand
        ? "growing"
        : netPerMonth < -flatBand
          ? "shrinking"
          : "flat",
  };
}
