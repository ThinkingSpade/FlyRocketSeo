import { createServerFn } from "@tanstack/react-start";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/shared/keyword-locations";
import { buildTopicClusters } from "@/server/features/keywords/services/topicClusterMapping";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { topicClustersRequestSchema } from "@/types/schemas/topic-clusters";

/** Cluster plans describe a topic space that shifts slowly; a week of cache
 *  keeps replanning free. One Labs keyword_ideas call (~$0.01) per new topic. */
const CLUSTERS_TTL_SECONDS = 7 * 24 * 60 * 60;

const IDEAS_LIMIT = 150;

import { topicClusterPlanSchema as planSchema } from "@/types/schemas/topic-clusters";

export const getTopicClusters = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(topicClustersRequestSchema)
  .handler(async ({ data, context }) => {
    const topic = data.topic.trim().toLowerCase();
    const locationCode = data.locationCode ?? DEFAULT_LOCATION_CODE;
    const languageCode = getLanguageCode(locationCode);

    // v2: suggestions (phrase-match) instead of ideas — ideas expands to
    // category-level concepts sharing any seed token ("office vending
    // machines" pulled in office chair mats), which makes junk clusters.
    const cacheKey = await buildCacheKey("topic-clusters:v2", {
      organizationId: context.organizationId,
      projectId: context.projectId,
      topic,
      locationCode,
      languageCode,
    });
    // Records this analysis for the tab's history / auto-restore. Free and best
    // effort: one row pointing at the cache key this result already lives under.
    const recordRun = () =>
      AnalysisRunService.record({
        projectId: context.projectId,
        feature: RUN_FEATURES.topicClusters,
        params: { topic, locationCode },
        cacheKey,
        label: topic,
      });

    const cached = planSchema.safeParse(await getCached(cacheKey));
    if (cached.success && cached.data.clusters.length > 0) {
      await recordRun();
      return cached.data;
    }

    const dataforseo = createDataforseoClient(context);
    const items = await dataforseo.keywords.suggestions({
      keyword: topic,
      locationCode,
      languageCode,
      limit: IDEAS_LIMIT,
    });

    const result = {
      topic,
      locationCode,
      languageCode,
      ...buildTopicClusters(topic, items),
      fetchedAt: new Date().toISOString(),
    };

    void setCached(cacheKey, result, CLUSTERS_TTL_SECONDS).catch((error) => {
      console.error("topic-clusters cache-write failed:", error);
    });
    await recordRun();

    return result;
  });
