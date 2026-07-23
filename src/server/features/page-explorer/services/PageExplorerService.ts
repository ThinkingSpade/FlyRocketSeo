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

/** Labs ranked-keyword data refreshes roughly monthly; a day of cache keeps
 *  repeat inspections free without meaningful staleness. */
const PAGE_EXPLORER_TTL_SECONDS = 24 * 60 * 60;

const KEYWORDS_LIMIT = 100;
const RELATIVE_URL_FIELD = "ranked_serp_element.serp_item.relative_url";

const pageKeywordSchema = z.object({
  keyword: z.string(),
  position: z.number().nullable(),
  searchVolume: z.number().nullable(),
  traffic: z.number().nullable(),
  cpc: z.number().nullable(),
  url: z.string().nullable(),
  relativeUrl: z.string().nullable(),
  keywordDifficulty: z.number().nullable(),
});

const pageBacklinksSchema = z.object({
  rank: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
});

const pageExplorerSchema = z.object({
  url: z.string(),
  domain: z.string(),
  path: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  keywords: z.array(pageKeywordSchema),
  totalKeywords: z.number().nullable(),
  estimatedTraffic: z.number(),
  backlinks: pageBacklinksSchema.nullable(),
  fetchedAt: z.string(),
});

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
  const domain = parsedUrl.hostname.replace(/^www\./, "");
  const path = parsedUrl.pathname || "/";
  const locationCode = input.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = getLanguageCode(locationCode);

  const cacheKey = await buildCacheKey("page-explorer", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    path,
    locationCode,
    languageCode,
  });
  // Records this analysis for the tab's history / auto-restore. Free and best
  // effort: one row pointing at the cache key this result already lives under.
  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.pageExplorer,
      params: { url: input.url, locationCode },
      cacheKey,
      label: `${domain}${path}`,
    });

  const cached = pageExplorerSchema.safeParse(await getCached(cacheKey));
  if (cached.success) {
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
  try {
    const summary = await dataforseo.backlinks.summary({ target: input.url });
    const parsed = summaryItemSchema.safeParse(summary);
    if (parsed.success) {
      backlinks = {
        rank: parsed.data.rank ?? null,
        backlinks: parsed.data.backlinks ?? null,
        referringDomains: parsed.data.referring_domains ?? null,
      };
    }
  } catch (error) {
    console.warn("page-explorer backlinks summary failed:", error);
  }

  const result: PageExplorerResult = {
    url: input.url,
    domain,
    path,
    locationCode,
    languageCode,
    keywords,
    totalKeywords: rankedPage.totalCount,
    estimatedTraffic: Math.round(
      keywords.reduce((sum, item) => sum + (item.traffic ?? 0), 0),
    ),
    backlinks,
    fetchedAt: new Date().toISOString(),
  };

  void setCached(cacheKey, result, PAGE_EXPLORER_TTL_SECONDS).catch((error) => {
    console.error("page-explorer cache-write failed:", error);
  });
  await recordRun();

  return result;
}

export const PageExplorerService = {
  getPageExplorer,
};
