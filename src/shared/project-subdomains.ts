/** Where a project subdomain row came from. */
export const SUBDOMAIN_SOURCES = ["manual", "gsc", "dataforseo"] as const;

export type SubdomainSource = (typeof SUBDOMAIN_SOURCES)[number];

export const SUBDOMAIN_SOURCE_LABELS: Record<SubdomainSource, string> = {
  manual: "Added manually",
  gsc: "Search Console",
  dataforseo: "Organic search",
};

/**
 * Sources a discovery run can pull from -- every `SubdomainSource` except
 * `manual`, which is the absence of discovery rather than a source.
 */
export const SUBDOMAIN_DISCOVERY_SOURCES = ["gsc", "dataforseo"] as const;

export type SubdomainDiscoverySource =
  (typeof SUBDOMAIN_DISCOVERY_SOURCES)[number];

/**
 * Ceiling on stored subdomains per project.
 *
 * Sized for the largest estate the product is built for: a site with a
 * subdomain per city (500-2,000 hosts), whose cities live in this same list.
 * Equal to the city importer's per-paste ceiling, so one full paste fits.
 * Discovery and import stop inserting at the cap rather than truncating
 * silently -- both report how many hosts they had to skip.
 */
export const MAX_SUBDOMAINS_PER_PROJECT = 2000;

/** Max length of a stored host, matching the `projects.domain` field cap. */
export const MAX_SUBDOMAIN_HOST_LENGTH = 253;

/**
 * Search Console window a discovery run examines.
 *
 * Long enough that a subdomain with only occasional impressions still shows up,
 * without paying for the extra rows -- and Worker CPU -- a 16-month pull costs.
 * Declared without a type annotation so it keeps its literal type and stays
 * assignable to the service's `GscDateRange` without an assertion; widening it
 * to `string` is what would break that call site.
 */
export const SUBDOMAIN_GSC_DATE_RANGE = "last_3_months";

/** Human-readable form of {@link SUBDOMAIN_GSC_DATE_RANGE} for UI copy. */
export const SUBDOMAIN_GSC_RANGE_LABEL = "last 3 months";
