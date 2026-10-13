import { z } from "zod";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/shared/keyword-locations";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { pageExplorerSchema } from "@/types/schemas/page-explorer";
import {
  providerCount,
  providerHundredScore,
} from "@/shared/provider-observations";

/** Labs ranked-keyword data refreshes roughly monthly; a day of cache keeps
 *  repeat inspections free without meaningful staleness. */
const PAGE_EXPLORER_TTL_SECONDS = 24 * 60 * 60;

const KEYWORDS_LIMIT = 100;
const RELATIVE_URL_FIELD = "ranked_serp_element.serp_item.relative_url";

type PageExplorerResult = z.infer<typeof pageExplorerSchema>;

// Backlinks summary item, read defensively (external data).
const summaryItemSchema = z
  .object({
    rank: z.number().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_domains: z.number().nullable().optional(),
  })
  .passthrough();

/** Both trailing-slash spellings of a path: Labs stores whichever variant the
 *  SERP showed, so an exact-match filter needs to cover both. */
function pathVariants(path: string): string[] {
  const noSlash = path.endsWith("/") ? path.slice(0, -1) : path;
  const withSlash = `${noSlash}/`;
  return noSlash === "" ? ["/"] : [...new Set([noSlash, withSlash])];
}

async function getPageExplorer(
  input: {
    projectId: string;
    url: string;
    locationCode?: number;
  },
  billingCustomer: BillingCustomerContext,
): Promise<PageExplorerResult> {
  const parsedUrl = new URL(input.url);
  parsedUrl.hash = "";
  const url = parsedUrl.href;
  const domain = parsedUrl.hostname;
  const path = parsedUrl.pathname || "/";
  const locationCode = input.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = getLanguageCode(locationCode);

  const scope = {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    url,
    domain,
    path,
    locationCode,
    languageCode,
  };
  const cacheKey = await buildCacheKey("page-explorer:v2", scope);
  // Records this analysis for the tab's history / auto-restore. Free and best
  // effort: one row pointing at the cache key this result already lives under.
  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.pageExplorer,
      params: { url, locationCode },
      cacheKey,
      label: `${domain}${path}`,
    });

  const cached = pageExplorerSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    cached.data.contractVersion === 2 &&
    JSON.stringify(cached.data.scope) === JSON.stringify(scope)
  ) {
    await recordRun();
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  const variants = pathVariants(path);
  const filters =
    variants.length === 1
      ? [[RELATIVE_URL_FIELD, "=", variants[0]]]
      : [
          [RELATIVE_URL_FIELD, "=", variants[0]],
          "or",
          [RELATIVE_URL_FIELD, "=", variants[1]],
        ];

  const rankedPage = await dataforseo.domain.rankedKeywords({
    target: domain,
    locationCode,
    languageCode,
    limit: KEYWORDS_LIMIT,
    orderBy: ["ranked_serp_element.serp_item.etv,desc"],
    filters,
    includeSubdomains: true,
  });

  const keywords = rankedPage.items
    .map(mapKeywordItem)
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        item != null,
    );

  // Page-level backlink profile; best-effort (a page with no backlink data is
  // normal, and a Backlinks API hiccup shouldn't sink the keyword view).
  let backlinks: PageExplorerResult["backlinks"] = null;
  // Carried alongside `backlinks` so the UI can tell "this page has no backlink
  // data" apart from "we failed to ask". Both used to render as two dashes.
  let backlinksStatus: PageExplorerResult["backlinksStatus"] = "no-data";
  try {
    const summary = await dataforseo.backlinks.summary({ target: url });
    const parsed = summaryItemSchema.safeParse(summary);
    if (parsed.success) {
      backlinks = {
        rank: providerHundredScore(parsed.data.rank),
        backlinks: providerCount(parsed.data.backlinks),
        referringDomains: providerCount(parsed.data.referring_domains),
      };
      backlinksStatus = "available";
    } else {
      // A response we cannot read is a failure to answer, not an answer of
      // "none" — the user should not be told this page has no backlinks.
      backlinksStatus = "error";
    }
  } catch (error) {
    console.warn("page-explorer backlinks summary failed:", error);
    backlinksStatus = "error";
  }

  const result: PageExplorerResult = {
    contractVersion: 2,
    source: "DataForSEO Labs and Backlinks",
    scope,
    url,
    domain,
    path,
    locationCode,
    languageCode,
    keywords,
    totalKeywords: providerCount(rankedPage.totalCount),
    estimatedTraffic:
      keywords.length !== rankedPage.items.length ||
      keywords.some((item) => item.traffic === null)
        ? null
        : keywords.reduce((sum, item) => sum + (item.traffic ?? 0), 0),
    backlinks,
    backlinksStatus,
    fetchedAt: new Date().toISOString(),
  };

  if (
    result.estimatedTraffic !== null &&
    !Number.isFinite(result.estimatedTraffic)
  )
    result.estimatedTraffic = null;
  const persisted = await setCached(cacheKey, result, PAGE_EXPLORER_TTL_SECONDS)
    .then(() => true)
    .catch((error) => {
      console.error("page-explorer cache-write failed:", error);
      return false;
    });
  if (persisted) await recordRun();

  return result;
}

export const PageExplorerService = {
  getPageExplorer,
};
