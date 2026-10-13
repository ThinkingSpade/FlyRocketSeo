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
  contractVersion: z.literal(2),
  source: z.literal("DataForSEO Local Finder"),
  scope: z.object({
    organizationId: z.string(),
    projectId: z.string(),
    domain: z.string(),
    keyword: z.string(),
    lat: z.string(),
    lng: z.string(),
    languageCode: z.literal("en"),
    device: z.literal("desktop"),
    searchType: z.literal("local_finder"),
    depth: z.literal(20),
  }),
  position: z.number().int().safe().min(1).max(LOCAL_FINDER_DEPTH).nullable(),
  topCompetitors: z.array(z.string()),
  fetchedAt: z.iso.datetime(),
});

function gridScope(input: {
  organizationId: string;
  projectId: string;
  domain: string;
  keyword: string;
  lat: string;
  lng: string;
}) {
  const { organizationId, projectId, domain, keyword, lat, lng } = input;
  return {
    organizationId,
    projectId,
    domain,
    keyword,
    lat,
    lng,
    languageCode: "en" as const,
    device: "desktop" as const,
    searchType: "local_finder" as const,
    depth: LOCAL_FINDER_DEPTH as 20,
  };
}
const cachedCellsRequestSchema = z.object({
  projectId: z.string().min(1),
  keyword: z.string().min(1).max(255),
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .max(49),
});

/**
 * Cache-only grid restore. Missing cells are omitted and never fall through to
 * DataForSEO, so it is safe for URL/history restoration on mount.
 */
export const getCachedLocalGridCells = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(cachedCellsRequestSchema)
  .handler(async ({ data, context }) => {
    const project = await ProjectRepository.getProjectById(context.projectId);
    const domain = project?.domain;
    if (!domain) return [];

    const keyword = data.keyword.trim().toLowerCase();
    const cells = await Promise.all(
      data.points.map(async (point) => {
        const lat = point.lat.toFixed(4);
        const lng = point.lng.toFixed(4);
        const scope = gridScope({
          organizationId: context.organizationId,
          projectId: context.projectId,
          domain,
          keyword,
          lat,
          lng,
        });
        const cacheKey = await buildCacheKey("local-grid:cell:v2", scope);
        const cached = cellSchema.safeParse(await getCached(cacheKey));
        return cached.success &&
          JSON.stringify(cached.data.scope) === JSON.stringify(scope)
          ? { lat: point.lat, lng: point.lng, ...cached.data }
          : null;
      }),
    );

    return cells.filter((cell) => cell !== null);
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

    const scope = gridScope({
      organizationId: context.organizationId,
      projectId: context.projectId,
      domain,
      keyword,
      lat,
      lng,
    });
    const cacheKey = await buildCacheKey("local-grid:cell:v2", scope);
    const cached = cellSchema.safeParse(await getCached(cacheKey));
    if (
      cached.success &&
      JSON.stringify(cached.data.scope) === JSON.stringify(scope)
    ) {
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
      contractVersion: 2 as const,
      source: "DataForSEO Local Finder" as const,
      scope,
      ...mapLocalGridCell(items, domain),
      fetchedAt: new Date().toISOString(),
    };

    await setCached(cacheKey, result, LOCAL_GRID_TTL_SECONDS).catch((error) => {
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
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
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
          if (
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            Math.abs(lat) <= 90 &&
            Math.abs(lng) <= 180
          ) {
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
