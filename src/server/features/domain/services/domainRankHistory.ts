import { z } from "zod";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { isRecord } from "@/server/lib/dataforseo/envelope";
import type { HistoricalRankOverviewItem } from "@/server/lib/dataforseo/labs-competitors";

/** Historical visibility refreshes daily; the tail months rarely change. */
const RANK_HISTORY_TTL_SECONDS = 24 * 60 * 60;

const rankHistoryPointSchema = z.object({
  date: z.string(),
  organicKeywords: z.number().nullable(),
  organicTraffic: z.number().nullable(),
  top3: z.number().nullable(),
});

type RankHistoryPoint = z.infer<typeof rankHistoryPointSchema>;

const rankHistoryResultSchema = z.object({
  points: z.array(rankHistoryPointSchema),
  fetchedAt: z.string(),
});

type RankHistoryResult = z.infer<typeof rankHistoryResultSchema>;

function readOrganicMetric(
  item: HistoricalRankOverviewItem,
  key: string,
): number | null {
  // Typed as unknown so the index reads below yield unknown, not the SDK's any.
  const metrics: unknown = item.metrics;
  if (!isRecord(metrics)) return null;
  const organic = metrics.organic;
  if (!isRecord(organic)) return null;
  const value = organic[key];
  return typeof value === "number" ? value : null;
}

function mapPoint(item: HistoricalRankOverviewItem): RankHistoryPoint | null {
  if (item.year == null || item.month == null) return null;
  const pos1 = readOrganicMetric(item, "pos_1");
  const pos23 = readOrganicMetric(item, "pos_2_3");
  const top3 =
    pos1 == null && pos23 == null ? null : (pos1 ?? 0) + (pos23 ?? 0);
  return {
    date: `${item.year}-${String(item.month).padStart(2, "0")}`,
    organicKeywords: readOrganicMetric(item, "count"),
    organicTraffic: readOrganicMetric(item, "etv"),
    top3,
  };
}

export async function getRankHistory(
  input: {
    projectId: string;
    domain: string;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<RankHistoryResult> {
  const domain = normalizeDomainInput(input.domain, true);

  const cacheKey = await buildCacheKey("domain:rank-history", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = rankHistoryResultSchema.safeParse(await getCached(cacheKey));
  if (cached.success && cached.data.points.length > 0) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const items = await dataforseo.domain.historicalRankOverview({
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const points = items
    .map(mapPoint)
    .filter((point): point is RankHistoryPoint => point != null)
    // DataForSEO returns newest-first; charts read left-to-right oldest-first.
    .toSorted((a, b) => a.date.localeCompare(b.date));

  const result: RankHistoryResult = {
    points,
    fetchedAt: new Date().toISOString(),
  };

  if (points.length > 0) {
    void setCached(cacheKey, result, RANK_HISTORY_TTL_SECONDS).catch(
      (error) => {
        console.error("domain.rank-history.cache-write failed:", error);
      },
    );
  }

  return result;
}
