import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";
import { asAppError } from "@/server/lib/errors";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  backlinksCompareResultSchema,
  competingDomainsResultSchema,
  linkIntersectResultSchema,
  referringNetworksResultSchema,
  LINK_INTERSECT_PAGE_SIZE,
  type BacklinksCompareResult,
  type CompetingDomainsResult,
  type LinkIntersectResult,
  type ReferringNetworksResult,
} from "@/types/schemas/backlinks-compare";
import { buildComparison } from "@/server/features/backlinks/services/backlinksComparison";
import { normalizeComparisonTarget } from "@/shared/backlink-targets";
import {
  mapIntersectionRows,
  summarizeNetworks,
} from "@/server/features/backlinks/services/backlinksCompareMappers";

/**
 * The competitive Backlinks calls. Each one is metered, so every entry point
 * checks R2 first and every result is cached under an organization-scoped key.
 *
 * The comparison is deliberately built from `bulk_*` endpoints: each covers
 * every target in a single billed request, so adding a fifth competitor costs
 * nothing extra. A per-target `summary` call each would have cost one request
 * per competitor.
 */

/** Link data moves slowly; a day of cache keeps repeat views free. */
const COMPARE_TTL_SECONDS = 24 * 60 * 60;
/** Matches the DataForSEO default window for the bulk new/lost endpoints. */
const NEW_LOST_WINDOW_DAYS = 30;
const COMPETING_DOMAINS_LIMIT = 25;
const REFERRING_NETWORKS_LIMIT = 100;

function toApiTarget(value: string): string {
  return normalizeBacklinksTarget(value, { scope: "domain" }).apiTarget;
}

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function readCache<T>(
  key: string,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
): Promise<T | null> {
  const parsed = schema.safeParse(await getCached(key));
  return parsed.success && parsed.data ? parsed.data : null;
}

function writeCache(key: string, value: unknown, label: string) {
  void setCached(key, value, COMPARE_TTL_SECONDS).catch((error) => {
    console.error(`backlinks.${label}.cache-write failed:`, error);
  });
}

async function compareProfiles(
  input: { target: string; competitors: string[] },
  billingCustomer: BillingCustomerContext,
): Promise<BacklinksCompareResult> {
  const target = toApiTarget(input.target);
  const competitors = input.competitors.map(toApiTarget);
  // Sorted so the same set entered in a different order reuses one cache entry.
  const cacheKey = await buildCacheKey("backlinks:compare", {
    organizationId: billingCustomer.organizationId,
    target,
    competitors: [...competitors].toSorted().join(","),
  });

  const cached = await readCache(cacheKey, backlinksCompareResultSchema);
  if (cached) return cached;

  const now = new Date();
  const since = isoDaysAgo(now, NEW_LOST_WINDOW_DAYS);
  // One request per metric covering every target, rather than one per target.
  const targets = [
    target,
    ...competitors.filter((competitor) => competitor !== target),
  ];
  const dataforseo = createDataforseoClient(billingCustomer);

  const [ranks, backlinks, referringDomains, newLost, spamScores] =
    await Promise.all([
      dataforseo.backlinks.bulkRanks({ targets }),
      dataforseo.backlinks.bulkBacklinks({ targets }),
      dataforseo.backlinks.bulkReferringDomains({ targets }),
      dataforseo.backlinks.bulkNewLostReferringDomains({
        targets,
        dateFrom: since,
      }),
      dataforseo.backlinks.bulkSpamScores({ targets }),
    ]);

  const result: BacklinksCompareResult = {
    ...buildComparison({
      you: target,
      competitors,
      ranks,
      backlinks,
      referringDomains,
      newLost,
      spamScores,
    }),
    since,
    fetchedAt: now.toISOString(),
  };

  if (result.rows.length > 0) writeCache(cacheKey, result, "compare");

  return result;
}

type IntersectionRequest = {
  targets: string[];
  excludeTargets: string[];
  limit: number;
  offset: number;
};

/**
 * Sorting by how many of the competitors each domain links to is the whole
 * point of the report, so it is tried first. `intersections_count` is the one
 * unprefixed field DataForSEO documents for this endpoint's sort catalogue; if
 * a given account rejects it the task comes back as an unbilled invalid-field
 * error, and the keyed sort the link-gap report has always used stands in.
 * Losing the ideal order beats returning nothing.
 */
async function fetchIntersectionPage(
  dataforseo: ReturnType<typeof createDataforseoClient>,
  request: IntersectionRequest,
) {
  try {
    return await dataforseo.backlinks.domainIntersection({
      ...request,
      orderBy: ["intersections_count,desc"],
    });
  } catch (error) {
    if (asAppError(error)?.code !== "VALIDATION_ERROR") throw error;
    console.warn(
      "backlinks.link-intersect: intersections_count sort rejected, falling back to rank",
    );
    return dataforseo.backlinks.domainIntersection({
      ...request,
      orderBy: ["1.rank,desc"],
    });
  }
}

/**
 * Referring domains that link to at least one competitor but not to the
 * analyzed target — the link gap, in the form Ahrefs calls Link Intersect.
 *
 * `exclude_targets` is what removes domains that already link to you, and the
 * per-row count of populated `domain_intersection` keys is how many of the
 * competitors each domain covers.
 */
async function linkIntersect(
  input: { target: string; competitors: string[]; page: number },
  billingCustomer: BillingCustomerContext,
): Promise<LinkIntersectResult> {
  const target = toApiTarget(input.target);
  const competitors = input.competitors
    .map(toApiTarget)
    .filter((competitor) => competitor !== target);

  if (competitors.length === 0) {
    return {
      rows: [],
      totalCount: 0,
      hasMore: false,
      page: input.page,
      competitors: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  const cacheKey = await buildCacheKey("backlinks:link-intersect", {
    organizationId: billingCustomer.organizationId,
    target,
    competitors: [...competitors].toSorted().join(","),
    page: input.page,
  });

  const cached = await readCache(cacheKey, linkIntersectResultSchema);
  if (cached) return cached;

  const dataforseo = createDataforseoClient(billingCustomer);
  const request = {
    targets: competitors,
    excludeTargets: [target],
    limit: LINK_INTERSECT_PAGE_SIZE,
    offset: (input.page - 1) * LINK_INTERSECT_PAGE_SIZE,
  };
  const response = await fetchIntersectionPage(dataforseo, request);

  const rows = mapIntersectionRows(response.items, competitors);
  const result: LinkIntersectResult = {
    rows,
    totalCount: response.totalCount,
    // Paging costs a request, so "Next" must not be offered on a guess. A full
    // page is only evidence of more when the total says so; without a total,
    // a short page is the one thing that definitely means the end.
    hasMore:
      response.totalCount != null
        ? input.page * LINK_INTERSECT_PAGE_SIZE < response.totalCount
        : rows.length === LINK_INTERSECT_PAGE_SIZE,
    page: input.page,
    competitors,
    fetchedAt: new Date().toISOString(),
  };

  if (rows.length > 0) writeCache(cacheKey, result, "link-intersect");

  return result;
}

/** Sites that share the most referring domains with the target. */
async function competingDomains(
  input: { target: string },
  billingCustomer: BillingCustomerContext,
): Promise<CompetingDomainsResult> {
  const target = toApiTarget(input.target);
  const cacheKey = await buildCacheKey("backlinks:competing-domains", {
    organizationId: billingCustomer.organizationId,
    target,
  });

  const cached = await readCache(cacheKey, competingDomainsResultSchema);
  if (cached) return cached;

  const dataforseo = createDataforseoClient(billingCustomer);
  const response = await dataforseo.backlinks.competitors({
    target,
    limit: COMPETING_DOMAINS_LIMIT,
  });

  const result: CompetingDomainsResult = {
    rows: response.items.flatMap((item) => {
      const domain = normalizeComparisonTarget(item.target);
      // The analyzed domain intersects itself completely; it is not a rival.
      if (domain === "" || domain === normalizeComparisonTarget(target)) {
        return [];
      }
      return [
        {
          domain,
          rank: item.rank ?? null,
          intersections: item.intersections ?? null,
        },
      ];
    }),
    fetchedAt: new Date().toISOString(),
  };

  if (result.rows.length > 0) writeCache(cacheKey, result, "competing-domains");

  return result;
}

/** Referring links grouped by subnet, to expose network concentration. */
async function referringNetworks(
  input: { target: string },
  billingCustomer: BillingCustomerContext,
): Promise<ReferringNetworksResult> {
  const target = toApiTarget(input.target);
  const cacheKey = await buildCacheKey("backlinks:referring-networks", {
    organizationId: billingCustomer.organizationId,
    target,
  });

  const cached = await readCache(cacheKey, referringNetworksResultSchema);
  if (cached) return cached;

  const dataforseo = createDataforseoClient(billingCustomer);
  const response = await dataforseo.backlinks.referringNetworks({
    target,
    networkAddressType: "subnet",
    limit: REFERRING_NETWORKS_LIMIT,
  });

  const result: ReferringNetworksResult = {
    ...summarizeNetworks(response.items, response.totalCount),
    fetchedAt: new Date().toISOString(),
  };

  if (result.rows.length > 0) {
    writeCache(cacheKey, result, "referring-networks");
  }

  return result;
}

export const BacklinksCompareService = {
  compareProfiles,
  linkIntersect,
  competingDomains,
  referringNetworks,
} as const;
