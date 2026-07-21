import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { mapLocalGridCell } from "@/server/features/local-seo/services/localGridMapping";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  geocodeRequestSchema,
  localGridCellRequestSchema,
} from "@/types/schemas/local-grid";

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

/** Geocoded results barely change; a month of cache keeps repeat lookups
 *  instant and stays well inside Nominatim's usage policy. */
const GEOCODE_TTL_SECONDS = 30 * 24 * 60 * 60;

const nominatimResultSchema = z.array(
  z
    .object({
      lat: z.string(),
      lon: z.string(),
      display_name: z.string().optional(),
    })
    .passthrough(),
);

const geocodeResultSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string(),
});

/**
 * Resolve a zip code / city / address to coordinates via OpenStreetMap's
 * Nominatim (free, no key). Low-volume internal use with an identifying
 * User-Agent per their policy; results cache for a month. Returns null when
 * the location can't be found.
 */
export const geocodeLocation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(geocodeRequestSchema)
  .handler(async ({ data, context }) => {
    const query = data.query.trim();
    const cacheKey = await buildCacheKey("local-grid:geocode", {
      organizationId: context.organizationId,
      query: query.toLowerCase(),
    });
    const cached = geocodeResultSchema
      .nullable()
      .safeParse(await getCached(cacheKey));
    if (cached.success && cached.data !== null) {
      return cached.data;
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");

    let result: z.infer<typeof geocodeResultSchema> | null = null;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "FlyRocketSEO/1.0 (self-hosted SEO tool)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const parsed = nominatimResultSchema.safeParse(await response.json());
        const first = parsed.success ? parsed.data[0] : undefined;
        if (first) {
          const lat = Number(first.lat);
          const lng = Number(first.lon);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            result = {
              lat,
              lng,
              label: first.display_name ?? query,
            };
          }
        }
      }
    } catch (error) {
      console.warn("local-grid geocode failed:", error);
    }

    if (result) {
      void setCached(cacheKey, result, GEOCODE_TTL_SECONDS).catch(
        (cacheError) => {
          console.error("geocode cache-write failed:", cacheError);
        },
      );
    }
    return result;
  });
