import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

const clusterKeywordSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
});

const planSchema = z.object({
  topic: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  hub: z.array(clusterKeywordSchema),
  clusters: z.array(
    z.object({
      name: z.string(),
      keywords: z.array(clusterKeywordSchema),
      totalVolume: z.number(),
    }),
  ),
  fetchedAt: z.string(),
});

export const getTopicClusters = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(topicClustersRequestSchema)
  .handler(async ({ data, context }) => {
    const topic = data.topic.trim().toLowerCase();
    const locationCode = data.locationCode ?? DEFAULT_LOCATION_CODE;
    const languageCode = getLanguageCode(locationCode);

    const cacheKey = await buildCacheKey("topic-clusters", {
      organizationId: context.organizationId,
      projectId: context.projectId,
      topic,
      locationCode,
      languageCode,
    });
    const cached = planSchema.safeParse(await getCached(cacheKey));
    if (cached.success && cached.data.clusters.length > 0) {
      return cached.data;
    }

    const dataforseo = createDataforseoClient(context);
    const items = await dataforseo.keywords.ideas({
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

    return result;
  });
