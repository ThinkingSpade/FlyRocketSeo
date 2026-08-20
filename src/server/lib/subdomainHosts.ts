import { isValidDomainHost } from "@/types/schemas/domain";

/**
 * Host-level helpers shared by subdomain discovery and the manual add path.
 *
 * Deliberately dependency-free beyond `tldts` (via `isValidDomainHost`) so the
 * classification rules can be unit-tested from the node-environment Vitest run:
 * the service that calls them transitively imports `cloudflare:workers` and
 * cannot be loaded outside a Workers runtime -- the same split
 * `audit/launch/projectStartUrl.ts` uses.
 */

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

/**
 * Reduce user- or provider-supplied input to a bare lowercase hostname.
 *
 * Accepts a bare host, a full URL, or a host with a port, and tolerates the
 * scheme-prefixed values a few legacy `projects.domain` rows still carry.
 * Returns null when the input does not resolve to a registrable host, so
 * garbage never reaches the database or DataForSEO.
 *
 * `www.` is NOT stripped here, unlike `normalizeDomain`. Whether a `www` host
 * counts as its own subdomain is a question about the apex it is being compared
 * against, and that belongs to `isSubdomainOfApex` -- stripping the prefix at
 * parse time would silently rewrite `www.example.com` into the apex before that
 * comparison ever ran.
 */
export function normalizeHost(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const withScheme = URL_SCHEME_PATTERN.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let hostname: string;
  try {
    hostname = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }

  // A fully-qualified name may carry a root-label dot ("blog.example.com.").
  // URL() preserves it, so two spellings of one host would otherwise occupy two
  // rows under the (project, host) unique index.
  const host = hostname.replace(/\.+$/, "");
  if (!host || !host.includes(".")) return null;

  // Rejects IPs and invented TLDs before they can be stored or sent upstream.
  return isValidDomainHost(host) ? host : null;
}

/** Bare host of a result URL, or null when it is not parseable. Named for the
 *  call sites below, where "normalize this host" would misdescribe what is
 *  being passed in. */
function hostFromUrl(url: string): string | null {
  return normalizeHost(url);
}

/**
 * Is `host` a subdomain of `apex`?
 *
 * Strict suffix matching against the apex itself, NOT a shared registrable
 * domain. The difference matters when the project's own domain is already a
 * subdomain (`shop.example.com`): a registrable-domain test would sweep in
 * `blog.example.com`, a sibling the project does not own. The leading dot in
 * the comparison is what keeps `notexample.com` from matching `example.com`.
 *
 * `www.<apex>` is excluded because the rest of the app treats apex and www as
 * one site -- the audit crawler's `isSameOrigin` accepts either as in-boundary.
 * Listing it as a subdomain would invite a duplicate of the project's own site.
 */
export function isSubdomainOfApex(host: string, apex: string): boolean {
  if (!host || !apex) return false;
  if (host === apex) return false;
  if (host === `www.${apex}`) return false;
  return host.endsWith(`.${apex}`);
}

export type DiscoveredHost = {
  host: string;
  /** GSC-sourced. Null when the discovering source could not report it. */
  clicks: number | null;
  impressions: number | null;
  /** DataForSEO-sourced. Null when the discovering source could not report it. */
  organicKeywords: number | null;
  organicTraffic: number | null;
};

/**
 * Fold GSC `page`-dimension rows into one entry per subdomain host.
 *
 * Rows whose host is the apex, a non-subdomain, or unparseable are dropped
 * rather than surfaced: a property can legitimately return the apex's own pages
 * and those are not discoveries.
 */
export function collectGscHosts(
  rows: Array<{ keys?: string[]; clicks: number; impressions: number }>,
  apex: string,
): DiscoveredHost[] {
  const byHost = new Map<string, DiscoveredHost>();

  for (const row of rows) {
    const pageUrl = row.keys?.[0];
    if (!pageUrl) continue;
    const host = hostFromUrl(pageUrl);
    if (!host || !isSubdomainOfApex(host, apex)) continue;

    const existing = byHost.get(host);
    if (existing) {
      existing.clicks = (existing.clicks ?? 0) + row.clicks;
      existing.impressions = (existing.impressions ?? 0) + row.impressions;
      continue;
    }
    byHost.set(host, {
      host,
      clicks: row.clicks,
      impressions: row.impressions,
      organicKeywords: null,
      organicTraffic: null,
    });
  }

  return [...byHost.values()];
}

type RankedKeywordLike = {
  ranked_serp_element?: {
    serp_item?: { url?: string | null; etv?: number | null } | null;
    url?: string | null;
    etv?: number | null;
  } | null;
};

/**
 * Fold DataForSEO ranked-keyword items into one entry per subdomain host.
 *
 * `organicKeywords` counts the ranking keywords seen on that host and
 * `organicTraffic` sums their estimated traffic, which is what makes a
 * several-hundred-host estate sortable by "which of these actually matter".
 *
 * Both numbers are floors, not totals: the caller requests a bounded page of
 * ranked keywords, so a host ranking beyond that cut-off is under-counted. They
 * order the list; they are not reported as the host's true keyword count.
 */
export function collectDataforseoHosts(
  items: RankedKeywordLike[],
  apex: string,
): DiscoveredHost[] {
  const byHost = new Map<string, DiscoveredHost>();

  for (const item of items) {
    const element = item.ranked_serp_element;
    const serpItem = element?.serp_item;
    const url = serpItem?.url ?? element?.url;
    if (!url) continue;
    const host = hostFromUrl(url);
    if (!host || !isSubdomainOfApex(host, apex)) continue;

    // Same precedence `domainKeywordMapper` uses: the SERP item's own figure
    // wins, with the element-level one as the fallback DataForSEO sometimes
    // populates instead.
    const etv = serpItem?.etv ?? element?.etv ?? 0;
    const existing = byHost.get(host);
    if (existing) {
      existing.organicKeywords = (existing.organicKeywords ?? 0) + 1;
      existing.organicTraffic = (existing.organicTraffic ?? 0) + etv;
      continue;
    }
    byHost.set(host, {
      host,
      clicks: null,
      impressions: null,
      organicKeywords: 1,
      organicTraffic: etv,
    });
  }

  // Round only after summing so a host's traffic isn't skewed by rounding each
  // keyword's fractional etv on the way in.
  return [...byHost.values()].map((entry) => ({
    ...entry,
    organicTraffic:
      entry.organicTraffic === null ? null : Math.round(entry.organicTraffic),
  }));
}

/**
 * Merge per-source discoveries into one entry per host.
 *
 * Metrics union rather than overwrite: GSC contributes clicks/impressions and
 * DataForSEO contributes the organic pair, so a host found by both keeps all
 * four instead of whichever source happened to run last. Later sources win only
 * on a metric the earlier one left null.
 */
export function mergeDiscoveredHosts(
  groups: DiscoveredHost[][],
): DiscoveredHost[] {
  const byHost = new Map<string, DiscoveredHost>();

  for (const group of groups) {
    for (const entry of group) {
      const existing = byHost.get(entry.host);
      if (!existing) {
        byHost.set(entry.host, { ...entry });
        continue;
      }
      existing.clicks = existing.clicks ?? entry.clicks;
      existing.impressions = existing.impressions ?? entry.impressions;
      existing.organicKeywords =
        existing.organicKeywords ?? entry.organicKeywords;
      existing.organicTraffic = existing.organicTraffic ?? entry.organicTraffic;
    }
  }

  return [...byHost.values()];
}
