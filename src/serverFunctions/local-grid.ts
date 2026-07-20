import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { mapLocalGridCell } from "@/server/features/local-seo/services/localGridMapping";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { localGridCellRequestSchema } from "@/types/schemas/local-grid";

/** Local rankings move slowly; a day of cache keeps grid refreshes cheap
 *  (each cell is one metered local-finder SERP call, ~$0.002). */
const LOCAL_GRID_TTL_SECONDS = 24 * 60 * 60;

const LOCAL_FINDER_DEPTH = 20;

const cellSchema = z.object({
  position: z.number().nullable(),
  topCompetitors: z.array(z.string()),
  fetchedAt: z.string(),
});

/**
 * One grid cell: the project's local-finder rank for a keyword at a specific
 * coordinate (a city center). One SERP call per invocation — the client fans
 * out across keyword x city, so each call stays inside the Worker CPU budget.
 */
export const getLocalGridCell = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localGridCellRequestSchema)
  .handler(async ({ data, context }) => {
    const project = await ProjectRepository.getProjectById(context.projectId);
    const domain = project?.domain;
    if (!domain) {
      throw new Error(
        "This project has no domain set — add one in project settings.",
      );
    }

    const keyword = data.keyword.trim().toLowerCase();
    // ~11m precision is plenty for a city-level pin and keeps the cache key
    // stable against float noise.
    const lat = data.lat.toFixed(4);
    const lng = data.lng.toFixed(4);

    const cacheKey = await buildCacheKey("local-grid:cell", {
      organizationId: context.organizationId,
      domain,
      keyword,
      lat,
      lng,
    });
    const cached = cellSchema.safeParse(await getCached(cacheKey));
    if (cached.success) {
      return cached.data;
    }

    const dataforseo = createDataforseoClient(context);
    const items = await dataforseo.serp.local({
      keyword,
      locationCoordinate: `${lat},${lng}`,
      languageCode: "en",
      searchType: "local_finder",
      device: "desktop",
      depth: LOCAL_FINDER_DEPTH,
    });

    const result = {
      ...mapLocalGridCell(items, domain),
      fetchedAt: new Date().toISOString(),
    };

    void setCached(cacheKey, result, LOCAL_GRID_TTL_SECONDS).catch((error) => {
      console.error("local-grid cache-write failed:", error);
    });

    return result;
  });
