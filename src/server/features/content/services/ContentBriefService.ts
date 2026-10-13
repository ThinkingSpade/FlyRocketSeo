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
import { SerpOverviewService } from "@/server/features/serp/services/SerpOverviewService";
import { providerTimestamp } from "@/shared/provider-observations";
import {
  extractBriefTerms,
  extractCompetitorPage,
} from "@/server/features/content/services/contentBriefMapping";

/** Briefs describe a SERP that shifts slowly at the topic level; a week keeps
 *  repeat lookups free. Competitor page analyses are billed per fetch, so they
 *  cache on the same clock. */
const BRIEF_TTL_SECONDS = 7 * 24 * 60 * 60;

const RELATED_TERMS_LIMIT = 30;
const MAX_COMPETITORS = 10;

import { contentBriefSchema } from "@/types/schemas/content";

type ContentBrief = z.infer<typeof contentBriefSchema>;

const competitorPageSchema = z.object({
  url: z.string(),
  title: z.string(),
  wordCount: z.number().int().safe().nonnegative().nullable().catch(null),
  h2: z.array(z.string()),
  h3: z.array(z.string()),
  h2Available: z.boolean().default(false),
  contractVersion: z.literal(2).optional(),
  source: z.string().optional(),
  fetchedAt: z.string().optional(),
  scope: z
    .object({
      organizationId: z.string(),
      projectId: z.string(),
      url: z.string(),
    })
    .optional(),
});
const competitorCacheSchema = z.object({
  contractVersion: z.literal(2),
  scope: z.object({
    organizationId: z.string(),
    projectId: z.string(),
    url: z.string(),
  }),
  page: competitorPageSchema.nullable(),
});

type CompetitorPageAnalysis = z.infer<typeof competitorPageSchema> | null;

/** The brief skeleton: who ranks (from the cached SERP overview), the related
 *  terms worth including, and the questions searchers ask. Competitor page
 *  bodies are analyzed separately — one page per call — so no single Worker
 *  invocation parses ten pages (the Free-plan CPU ceiling is tight). */
async function getContentBrief(
  input: {
    projectId: string;
    keyword: string;
    locationCode?: number;
    serpLocationCode?: number;
    serpLanguageCode?: string;
    /** The client's own captured geo bundle (Defect 1 fix) -- opaque here,
     *  forwarded verbatim into `params` purely so a later restore can read
     *  it back; this service never inspects or resolves it itself. */
    geo?: unknown;
  },
  billingCustomer: BillingCustomerContext,
): Promise<ContentBrief> {
  const keyword = input.keyword.trim().toLowerCase();
  const locationCode = input.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = getLanguageCode(locationCode);
  // Only the internal ranking-competitors lookup ever gets a different
  // (possibly local/metro) geo than the rest of this brief -- see this
  // field's own doc comment in contentBriefRequestSchema.
  const serpLocationCode = input.serpLocationCode ?? locationCode;
  const serpLanguageCode = input.serpLanguageCode ?? languageCode;

  const scope = {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    locationCode,
    languageCode,
    // Included so a metro-scoped competitors fetch and a national one for
    // the SAME (keyword, locationCode) never share a cache entry -- without
    // this, whichever scope ran first would silently serve its competitors
    // list to the other.
    serpLocationCode,
    serpLanguageCode,
  };
  const cacheKey = await buildCacheKey("content:brief:v2", scope);
  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.contentBrief,
      params: {
        keyword,
        locationCode,
        serpLocationCode,
        languageCode,
        serpLanguageCode,
        geo: input.geo ?? null,
      },
      cacheKey,
      label: keyword,
    });

  const cached = contentBriefSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    cached.data.contractVersion === 2 &&
    JSON.stringify(cached.data.scope) === JSON.stringify(scope)
  ) {
    await recordRun();
    return cached.data;
  }

  const overview = await SerpOverviewService.getSerpOverview(
    {
      projectId: input.projectId,
      keyword,
      locationCode: serpLocationCode,
      languageCode: serpLanguageCode,
    },
    billingCustomer,
  );

  const dataforseo = createDataforseoClient(billingCustomer);
  let terms: ContentBrief["terms"] = [];
  let termsFetchedAt: string | null = null;
  try {
    const relatedItems = await dataforseo.keywords.related({
      keyword,
      locationCode,
      languageCode,
      limit: RELATED_TERMS_LIMIT,
      depth: 2,
    });
    terms = extractBriefTerms(relatedItems);
    termsFetchedAt = new Date().toISOString();
  } catch (error) {
    // Terms are one ingredient, not the meal — a Labs failure (e.g. a keyword
    // Labs has no data for) still leaves a useful brief.
    console.warn("content:brief related-terms lookup failed:", error);
  }

  const result: ContentBrief = {
    contractVersion: 2,
    source: "DataForSEO SERP and Labs estimates",
    scope,
    components: {
      serp: {
        source: "DataForSEO Google Organic SERP",
        fetchedAt: providerTimestamp(overview.fetchedAt),
        locationCode: serpLocationCode,
        languageCode: serpLanguageCode,
      },
      terms: {
        source: "DataForSEO Labs related keywords",
        fetchedAt: termsFetchedAt,
        availability: termsFetchedAt === null ? "unavailable" : "observed",
        locationCode,
        languageCode,
      },
    },
    keyword,
    locationCode,
    languageCode,
    competitors: overview.results
      .slice(0, MAX_COMPETITORS)
      .map(({ rank, title, url, domain }) => ({ rank, title, url, domain })),
    terms,
    paaQuestions: overview.paaQuestions,
    fetchedAt: new Date().toISOString(),
  };

  const cacheWritten = await setCached(cacheKey, result, BRIEF_TTL_SECONDS)
    .then(() => true)
    .catch((error) => {
      console.error("content:brief cache-write failed:", error);
      return false;
    });
  if (cacheWritten) await recordRun();

  return result;
}

/** Analyze ONE ranking page via instant_pages without browser rendering.
 *  This capture can omit headings generated by client-side scripts.
 *  Returns null when the page can't be analyzed. */
async function analyzeCompetitorPage(
  input: { projectId: string; url: string },
  billingCustomer: BillingCustomerContext,
): Promise<CompetitorPageAnalysis> {
  const scope = {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    url: input.url,
  };
  const cacheKey = await buildCacheKey("content:competitor:v2", scope);
  const cached = competitorCacheSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    JSON.stringify(cached.data.scope) === JSON.stringify(scope)
  ) {
    return cached.data.page;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const item = await dataforseo.onPage.instantPage({ url: input.url });
  const page = item
    ? {
        ...extractCompetitorPage(input.url, item),
        contractVersion: 2 as const,
        source: "DataForSEO On-Page instant pages",
        fetchedAt: new Date().toISOString(),
        scope,
      }
    : null;
  await setCached(
    cacheKey,
    { contractVersion: 2, scope, page },
    BRIEF_TTL_SECONDS,
  ).catch((error) => {
    console.error("content:competitor cache-write failed:", error);
  });
  return page;
}

export const ContentBriefService = {
  getContentBrief,
  analyzeCompetitorPage,
};
