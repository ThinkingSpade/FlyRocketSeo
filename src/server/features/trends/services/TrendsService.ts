import type { z } from "zod";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { TrendsGraphItem } from "@/server/lib/dataforseo/trends";
import { trendsResultSchema, type TrendsPoint } from "@/types/schemas/trends";

/** Trend curves shift slowly; refresh daily. */
const TRENDS_TTL_SECONDS = 24 * 60 * 60;

// Re-exported: consumers (the MCP trends tool) import this type from the
// service, not from the schema module it now lives in.
export type { TrendsPoint };

type TrendsResult = z.infer<typeof trendsResultSchema>;

function mapGraphItem(
  requestedKeywords: string[],
  item: TrendsGraphItem | undefined,
): Omit<TrendsResult, "fetchedAt"> {
  const keywords = item?.keywords ?? requestedKeywords;
  const points = (item?.data ?? [])
    .map((point) => {
      if (point.timestamp == null || !point.date_from) return null;
      return {
        timestamp: point.timestamp * 1000,
        date: point.date_from,
        values: keywords.map((_, index) => point.values?.[index] ?? null),
      };
    })
    .filter((point): point is TrendsPoint => point != null);

  return {
    keywords,
    averages: keywords.map((_, index) => item?.averages?.[index] ?? null),
    points,
  };
}

async function getTrends(
  input: {
    projectId: string;
    keywords: string[];
    locationCode?: number;
    languageCode: string;
    dateFrom?: string;
    dateTo?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<TrendsResult> {
  const keywords = input.keywords.map((keyword) =>
    keyword.trim().toLowerCase(),
  );

  const cacheKey = await buildCacheKey("trends:explore", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keywords,
    locationCode: input.locationCode ?? null,
    languageCode: input.languageCode,
    dateFrom: input.dateFrom ?? null,
    dateTo: input.dateTo ?? null,
  });

  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.keywordTrends,
      params: {
        keywords,
        locationCode: input.locationCode ?? null,
        languageCode: input.languageCode,
      },
      cacheKey,
      label: keywords.join(", "),
    });

  const cached = trendsResultSchema.safeParse(await getCached(cacheKey));
  if (cached.success && cached.data.points.length > 0) {
    await recordRun();
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const items = await dataforseo.keywords.trends({
    keywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });

  const graph = items.find((item) => item.type === "google_trends_graph");
  const result: TrendsResult = {
    ...mapGraphItem(keywords, graph),
    fetchedAt: new Date().toISOString(),
  };

  if (result.points.length > 0) {
    void setCached(cacheKey, result, TRENDS_TTL_SECONDS).catch((error) => {
      console.error("trends.explore.cache-write failed:", error);
    });
    await recordRun();
  }

  return result;
}

export const TrendsService = {
  getTrends,
} as const;
