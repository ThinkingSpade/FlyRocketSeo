import type { z } from "zod";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { TrendsGraphItem } from "@/server/lib/dataforseo/trends";
import {
  trendsCalendarDateSchema,
  trendsResultSchema,
  type TrendsPoint,
} from "@/types/schemas/trends";
import { AppError } from "@/server/lib/errors";

/** Trend curves shift slowly; refresh daily. */
const TRENDS_TTL_SECONDS = 24 * 60 * 60;

// Re-exported: consumers (the MCP trends tool) import this type from the
// service, not from the schema module it now lives in.
export type { TrendsPoint };

type TrendsResult = z.infer<typeof trendsResultSchema>;

function mapGraphItem(
  requestedKeywords: string[],
  item: TrendsGraphItem | undefined,
): Pick<TrendsResult, "keywords" | "averages" | "points"> {
  const keywords = item?.keywords ?? requestedKeywords;
  const points = (item?.data ?? [])
    .map((point) => {
      if (point.timestamp == null || !point.date_from) return null;
      return {
        timestamp: point.timestamp * 1000,
        date: point.date_from,
        values: keywords.map((_, index) =>
          point.missing_data ? null : (point.values?.[index] ?? null),
        ),
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
    /** The client's own captured geo bundle (Defect 1 fix) -- opaque here,
     *  forwarded verbatim into `params` purely so a later restore can read
     *  it back; this service never inspects or resolves it itself. */
    geo?: unknown;
  },
  billingCustomer: BillingCustomerContext,
): Promise<TrendsResult> {
  const keywords = [
    ...new Set(input.keywords.map((keyword) => keyword.trim().toLowerCase())),
  ];
  const capturedAt = new Date();
  const previousYear = new Date(capturedAt);
  previousYear.setUTCFullYear(previousYear.getUTCFullYear() - 1);
  // Clamp February 29 to February 28 in a non-leap preceding year.
  if (previousYear.getUTCMonth() !== capturedAt.getUTCMonth())
    previousYear.setUTCDate(0);
  const dateFrom = input.dateFrom ?? previousYear.toISOString().slice(0, 10);
  const dateTo = input.dateTo ?? capturedAt.toISOString().slice(0, 10);
  if (
    !trendsCalendarDateSchema.safeParse(dateFrom).success ||
    !trendsCalendarDateSchema.safeParse(dateTo).success ||
    dateFrom > dateTo
  )
    throw new AppError("VALIDATION_ERROR", "Invalid trend date window");
  const scope = {
    projectId: input.projectId,
    locationCode: input.locationCode ?? null,
    languageCode: input.languageCode,
    dateFrom,
    dateTo,
  };

  const cacheKey = await buildCacheKey("trends:explore:v2", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keywords,
    locationCode: input.locationCode ?? null,
    languageCode: input.languageCode,
    dateFrom,
    dateTo,
  });

  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.keywordTrends,
      params: {
        keywords,
        locationCode: input.locationCode ?? null,
        languageCode: input.languageCode,
        dateFrom,
        dateTo,
        contractVersion: 2,
        geo: input.geo ?? null,
      },
      cacheKey,
      label: keywords.join(", "),
    });

  const cached = trendsResultSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    cached.data.contractVersion === 2 &&
    JSON.stringify(cached.data.scope) === JSON.stringify(scope) &&
    JSON.stringify(cached.data.keywords) === JSON.stringify(keywords)
  ) {
    await recordRun();
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const items = await dataforseo.keywords.trends({
    keywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    dateFrom,
    dateTo,
  });

  const graph = items.find((item) => item.type === "google_trends_graph");
  const result = trendsResultSchema.parse({
    ...mapGraphItem(keywords, graph),
    contractVersion: 2,
    dataSource: "DataForSEO Google Trends",
    scope,
    fetchedAt: new Date().toISOString(),
  });

  const written = await setCached(cacheKey, result, TRENDS_TTL_SECONDS)
    .then(() => true)
    .catch((error) => {
      console.error("trends.explore.cache-write failed:", error);
      return false;
    });
  if (written) await recordRun();

  return result;
}

export const TrendsService = {
  getTrends,
} as const;
