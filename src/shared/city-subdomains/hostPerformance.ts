/**
 * Rolls Search Console page rows up to one row per hostname.
 *
 * This is the whole join between the city-site registry and GSC. A Domain
 * property (`sc-domain:example.com`) reports every subdomain under one
 * property, and the `page` dimension returns full URLs, so the hostname in
 * each URL IS the city site — no extra API call, no extra cost, and no
 * per-city property to configure.
 *
 * Pure and dependency-free so the arithmetic below can be tested directly.
 * That matters more than usual here, because two of the three figures cannot
 * be combined by averaging and getting either one wrong produces a number that
 * looks entirely plausible on screen.
 */

/** The subset of a GSC row this needs. `keys[0]` is the page URL. */
export type GscPageRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  position?: number;
};

export type HostPerformance = {
  host: string;
  clicks: number;
  impressions: number;
  /** Derived from the summed totals, never averaged. */
  ctr: number;
  /** Impression-weighted mean, or null when the host had no impressions. */
  position: number | null;
  /** How many page rows rolled up into this host. */
  pageCount: number;
};

/**
 * The hostname of a GSC page URL, lowercased.
 *
 * Returns null rather than throwing for anything unparseable: GSC is an
 * external source, and one malformed row must cost that row, not the whole
 * report.
 */
export function hostFromPageUrl(page: string | undefined): string | null {
  if (!page) return null;
  try {
    return new URL(page).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Groups page rows by hostname and totals them.
 *
 * Clicks and impressions are sums, which is the only correct combination for
 * counts. The other two are the traps:
 *
 * - CTR is recomputed from the summed clicks and impressions. Averaging
 *   per-page CTRs weights a page with 3 impressions the same as one with
 *   30,000, which is not a rate anyone means.
 * - Position is an IMPRESSION-WEIGHTED mean. Each GSC row's `position` is
 *   already an average over that page's impressions, so combining rows means
 *   weighting by impressions again — sum(position x impressions) / sum(impressions).
 *   A plain mean of positions lets a page that was seen three times at rank 2
 *   drag a host's headline position down as hard as its main landing page.
 *
 * Rows with no impressions contribute their clicks (which should be zero) but
 * are excluded from the position weighting, since they carry no evidence about
 * ranking and a zero weight is exactly what "no evidence" means.
 */
export function aggregateByHost(
  rows: readonly GscPageRow[],
): HostPerformance[] {
  const totals = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      positionWeightSum: number;
      pageCount: number;
    }
  >();

  for (const row of rows) {
    const host = hostFromPageUrl(row.keys?.[0]);
    if (!host) continue;

    const clicks = row.clicks ?? 0;
    const impressions = row.impressions ?? 0;
    const entry = totals.get(host) ?? {
      clicks: 0,
      impressions: 0,
      positionWeightSum: 0,
      pageCount: 0,
    };

    entry.clicks += clicks;
    entry.impressions += impressions;
    entry.pageCount += 1;
    if (impressions > 0 && typeof row.position === "number") {
      entry.positionWeightSum += row.position * impressions;
    }
    totals.set(host, entry);
  }

  return [...totals.entries()].map(([host, entry]) => ({
    host,
    clicks: entry.clicks,
    impressions: entry.impressions,
    ctr: entry.impressions > 0 ? entry.clicks / entry.impressions : 0,
    position:
      entry.impressions > 0
        ? entry.positionWeightSum / entry.impressions
        : null,
    pageCount: entry.pageCount,
  }));
}

/**
 * Hosts ordered by clicks, then impressions, then name.
 *
 * The two tiebreaks are what make this a stable total order: without them,
 * the long tail of cities on zero clicks would shuffle between renders and
 * paging through it would repeat and skip rows.
 */
export function sortHostsByPerformance(
  hosts: readonly HostPerformance[],
): HostPerformance[] {
  return [...hosts].toSorted(
    (a, b) =>
      b.clicks - a.clicks ||
      b.impressions - a.impressions ||
      a.host.localeCompare(b.host),
  );
}
