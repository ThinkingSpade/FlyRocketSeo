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
  wordCount: z.number().nullable(),
  h2: z.array(z.string()),
  h3: z.array(z.string()),
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
  },
  billingCustomer: BillingCustomerContext,
): Promise<ContentBrief> {
  const keyword = input.keyword.trim().toLowerCase();
  const locationCode = input.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = getLanguageCode(locationCode);

  const cacheKey = await buildCacheKey("content:brief", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    locationCode,
    languageCode,
  });
  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.contentBrief,
      params: { keyword, locationCode },
      cacheKey,
      label: keyword,
    });

  const cached = contentBriefSchema.safeParse(await getCached(cacheKey));
  if (cached.success && cached.data.competitors.length > 0) {
    await recordRun();
    return cached.data;
  }

  const overview = await SerpOverviewService.getSerpOverview(
    { projectId: input.projectId, keyword, locationCode },
    billingCustomer,
  );

  const dataforseo = createDataforseoClient(billingCustomer);
  let terms: ContentBrief["terms"] = [];
  try {
    const relatedItems = await dataforseo.keywords.related({
      keyword,
      locationCode,
      languageCode,
      limit: RELATED_TERMS_LIMIT,
      depth: 2,
    });
    terms = extractBriefTerms(relatedItems);
  } catch (error) {
    // Terms are one ingredient, not the meal — a Labs failure (e.g. a keyword
    // Labs has no data for) still leaves a useful brief.
    console.warn("content:brief related-terms lookup failed:", error);
  }

  const result: ContentBrief = {
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

  void setCached(cacheKey, result, BRIEF_TTL_SECONDS).catch((error) => {
    console.error("content:brief cache-write failed:", error);
  });
  await recordRun();

  return result;
}

/** Analyze ONE ranking page via instant_pages (no JS rendering: SERP-ranking
 *  pages are server-rendered by definition, and non-rendered fetches are ~5x
 *  cheaper). Returns null when the page can't be analyzed. */
async function analyzeCompetitorPage(
  input: { projectId: string; url: string },
  billingCustomer: BillingCustomerContext,
): Promise<CompetitorPageAnalysis> {
  const cacheKey = await buildCacheKey("content:competitor", {
    organizationId: billingCustomer.organizationId,
    url: input.url,
  });
  const cached = competitorPageSchema.safeParse(await getCached(cacheKey));
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const item = await dataforseo.onPage.instantPage({ url: input.url });
  if (!item) return null;

  const page = extractCompetitorPage(input.url, item);
  void setCached(cacheKey, page, BRIEF_TTL_SECONDS).catch((error) => {
    console.error("content:competitor cache-write failed:", error);
  });
  return page;
}

export const ContentBriefService = {
  getContentBrief,
  analyzeCompetitorPage,
};
