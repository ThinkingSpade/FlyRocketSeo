import type { z } from "zod";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/shared/keyword-locations";
import { citationTrackerResultSchema } from "@/types/schemas/citations";
import { buildCitationSearchQuery } from "@/server/features/citations/services/citationQuery";

/**
 * Runs the Citation Tracker's discovery search: one live organic SERP query
 * (the same DataForSEO call SERP Overview already uses -- see
 * SerpOverviewService.ts) for the business name plus its strongest
 * disambiguator, cached raw for citationModel.ts to interpret client-side.
 *
 * SPEND DISCIPLINE: this is metered and must only ever run from an explicit
 * click (enforced client-side via useAuthorizedRun -- see
 * CitationTrackerSection.tsx). Exactly one query per run, never a batch:
 * bounding the request to a single call keeps the per-run cost fixed and
 * disclosable in the UI before the click, rather than scaling with however
 * many directories happen to be on the list.
 */

/** Directory listings change slowly; a half-day cache keeps repeat checks
 *  free without going stale -- matches the local-seo business-profile
 *  cache's own TTL (LocalSeoService.ts's LOCAL_SEO_TTL_SECONDS). */
const CITATION_TRACKER_TTL_SECONDS = 12 * 60 * 60;

type CitationTrackerResult = z.infer<typeof citationTrackerResultSchema>;

async function getCitationReport(
  input: {
    projectId: string;
    businessName: string;
    // Optional (not just nullable) to match citationTrackerRequestSchema's
    // inferred shape exactly -- this project's tsconfig has
    // exactOptionalPropertyTypes on, which treats "absent key" and "present
    // key valued undefined" as distinct types.
    city?: string | null;
    phone?: string | null;
    locationCode?: number;
    languageCode?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<CitationTrackerResult> {
  const businessName = input.businessName.trim();
  const city = input.city?.trim() || null;
  const phone = input.phone?.trim() || null;
  const locationCode = input.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = input.languageCode ?? getLanguageCode(locationCode);
  const query = buildCitationSearchQuery({ businessName, city, phone });

  const cacheKey = await buildCacheKey("citations:tracker", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    query,
    locationCode,
    languageCode,
  });

  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.citationTracker,
      params: { businessName, city, phone, locationCode, languageCode },
      cacheKey,
      label: businessName,
    });

  const cached = citationTrackerResultSchema.safeParse(
    await getCached(cacheKey),
  );
  if (cached.success && cached.data.results.length > 0) {
    await recordRun();
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  // Plain organic-live-advanced billing defaults to "keyword_research"
  // (mapDataforseoPathToCreditFeature) -- this is a Local SEO discovery
  // search, not keyword research, so the credit spend is attributed
  // explicitly rather than silently miscategorized.
  const items = await dataforseo.serp.live({
    keyword: query,
    locationCode,
    languageCode,
    creditFeature: "local_seo",
  });

  const result: CitationTrackerResult = {
    query,
    businessName,
    city,
    phone,
    locationCode,
    languageCode,
    // Non-organic SERP furniture (People Also Ask, videos, etc.) can carry
    // domains that have nothing to do with this business's own footprint --
    // restricting to organic keeps both the found/missing match and the
    // result-count-based thin-data check honest, mirroring
    // buildRankCheckResult's own organic-only filter in serp.ts.
    results: items
      .filter((item) => item.type === "organic")
      .map((item) => ({
        domain: item.domain ?? null,
        url: item.url ?? null,
        title: item.title ?? null,
      })),
    fetchedAt: new Date().toISOString(),
  };

  void setCached(cacheKey, result, CITATION_TRACKER_TTL_SECONDS).catch(
    (error) => {
      console.error("citations:tracker cache-write failed:", error);
    },
  );
  await recordRun();

  return result;
}

export const CitationTrackerService = {
  getCitationReport,
};
