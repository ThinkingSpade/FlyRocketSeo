import { z } from "zod";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/shared/keyword-locations";
import { mapSerpOverview } from "@/server/features/serp/services/serpOverviewMapping";

/** SERPs shift within hours, but overview research doesn't need minute-fresh
 *  data — 6h keeps repeat lookups free without going stale. */
const SERP_OVERVIEW_TTL_SECONDS = 6 * 60 * 60;

const serpOverviewResultSchema = z.object({
  rank: z.number().nullable(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  domain: z.string().nullable(),
  description: z.string().nullable(),
  etv: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  previousRank: z.number().nullable(),
  isNew: z.boolean(),
  isUp: z.boolean(),
  isDown: z.boolean(),
  /** Estimated monthly organic traffic for the result's whole domain (Labs
   *  bulk_traffic_estimation) — the plain SERP payload carries no metrics. */
  domainEtv: z.number().nullable(),
});

// Labs bulk_traffic_estimation item, parsed defensively (external data).
const trafficEstimationItemSchema = z
  .object({
    target: z.string().nullable().optional(),
    metrics: z
      .object({
        organic: z
          .object({ etv: z.number().nullable().optional() })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const serpOverviewSchema = z.object({
  keyword: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  results: z.array(serpOverviewResultSchema),
  paaQuestions: z.array(z.string()),
  serpFeatures: z.array(z.object({ type: z.string(), count: z.number() })),
  totalOrganic: z.number(),
  fetchedAt: z.string(),
});

export type SerpOverviewResponse = z.infer<typeof serpOverviewSchema>;

async function getSerpOverview(
  input: {
    projectId: string;
    keyword: string;
    locationCode?: number;
    languageCode?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<SerpOverviewResponse> {
  const keyword = input.keyword.trim().toLowerCase();
  const locationCode = input.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = input.languageCode ?? getLanguageCode(locationCode);

  const cacheKey = await buildCacheKey("serp:overview", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    locationCode,
    languageCode,
  });

  const cached = serpOverviewSchema.safeParse(await getCached(cacheKey));
  if (cached.success && cached.data.results.length > 0) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const items = await dataforseo.serp.live({
    keyword,
    locationCode,
    languageCode,
  });
  const overview = mapSerpOverview(items);

  // The SERP payload has no per-result metrics, so enrich each ranking domain
  // with its estimated monthly organic traffic in one bulk Labs call.
  // Best-effort: an enrichment failure never sinks the overview.
  const etvByDomain = new Map<string, number>();
  const domains = [
    ...new Set(
      overview.results
        .map((item) => item.domain)
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ];
  if (domains.length > 0) {
    try {
      const estimates = await dataforseo.competitors.trafficEstimation({
        targets: domains,
        locationCode,
        languageCode,
      });
      for (const raw of estimates) {
        const parsed = trafficEstimationItemSchema.safeParse(raw);
        if (!parsed.success) continue;
        const target = parsed.data.target;
        const etv = parsed.data.metrics?.organic?.etv;
        if (target && etv != null) etvByDomain.set(target, etv);
      }
    } catch (error) {
      console.warn("serp:overview traffic enrichment failed:", error);
    }
  }

  const result: SerpOverviewResponse = {
    keyword,
    locationCode,
    languageCode,
    ...overview,
    results: overview.results.map((item) => ({
      ...item,
      domainEtv:
        item.domain != null ? (etvByDomain.get(item.domain) ?? null) : null,
    })),
    fetchedAt: new Date().toISOString(),
  };

  void setCached(cacheKey, result, SERP_OVERVIEW_TTL_SECONDS).catch((error) => {
    console.error("serp:overview cache-write failed:", error);
  });

  return result;
}

export const SerpOverviewService = {
  getSerpOverview,
};
