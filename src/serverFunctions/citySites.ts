import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CITY_SITE_IMPORT_MAX_HOSTS,
  CitySiteService,
} from "@/server/features/city-sites/services/CitySiteService";
import { requireProjectContext } from "@/serverFunctions/middleware";

/**
 * The city-subdomain registry's endpoints.
 *
 * Every one of these is FREE to call. Import, preview, listing and correction
 * touch only D1 (`geo_locations` for the read, `project_city_sites` for the
 * write) — see CitySiteService's own header for why a feature whose whole
 * point is 2,000 rows must never put a metered lookup on that path.
 *
 * `projectId` is declared in every validator below for the reason
 * targetAreas.ts spells out: `ensureUserMiddleware` resolves `context.project`
 * from the RAW client payload before any `.validator()` narrows it, so a
 * `requireProjectContext` function without a `projectId` field can never
 * receive one and throws "Project context missing" unconditionally.
 */

/**
 * Caps the paste at roughly the longest hostname (253 chars) times the host
 * ceiling, with room for the separators and the extra CSV columns
 * `parseCityHosts` tolerates. Bounds the request body without rejecting a
 * legitimate full-size list.
 */
const MAX_IMPORT_TEXT_LENGTH = CITY_SITE_IMPORT_MAX_HOSTS * 320;

const importTextSchema = z.object({
  projectId: z.string().min(1),
  text: z.string().min(1).max(MAX_IMPORT_TEXT_LENGTH),
});

/**
 * What an import would do, without writing anything — the step that makes a
 * 2,000-row import safe to run, since the alternative is finding out which
 * cities resolved wrongly only once they are already rows.
 */
export const previewCitySiteImport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(importTextSchema)
  .handler(async ({ data, context }) =>
    CitySiteService.previewImport({
      projectId: context.projectId,
      projectDomain: context.project.domain,
      text: data.text,
    }),
  );

const importChunkSchema = importTextSchema.extend({
  offset: z.number().int().min(0).max(CITY_SITE_IMPORT_MAX_HOSTS),
});

/**
 * One bounded slice of an import; the caller loops until `done`.
 *
 * Chunked for the same reason `seedGeoLocationsChunk` is: this deployment runs
 * on the Workers Free plan, whose fixed per-invocation CPU ceiling a 2,000-row
 * import would exceed in a single request. Re-running a chunk is safe — the
 * unique index on (project_id, host) makes the insert idempotent — so a
 * client that retries after a network blip cannot create duplicates.
 */
export const importCitySitesChunk = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(importChunkSchema)
  .handler(async ({ data, context }) =>
    CitySiteService.importChunk({
      projectId: context.projectId,
      projectDomain: context.project.domain,
      text: data.text,
      offset: data.offset,
    }),
  );

const listCitySitesSchema = z.object({
  projectId: z.string().min(1),
  search: z.string().trim().max(120).optional(),
  matchStatus: z.enum(["matched", "ambiguous", "unmatched"]).optional(),
  page: z.number().int().min(1).default(1),
  // Bounded so one render can never ask for the whole registry at once.
  pageSize: z.number().int().min(10).max(200).default(50),
});

export const getCitySites = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listCitySitesSchema)
  .handler(async ({ data, context }) =>
    CitySiteService.list({
      projectId: context.projectId,
      search: data.search,
      matchStatus: data.matchStatus,
      page: data.page,
      pageSize: data.pageSize,
    }),
  );

const assignCitySiteLocationSchema = z.object({
  projectId: z.string().min(1),
  citySiteId: z.string().min(1),
  locationCode: z.number().int().positive(),
});

/**
 * Pins one host to a city an operator picked, for the rows automatic matching
 * deliberately left unresolved (the six Dallases, a label no seeded city
 * carries). The service re-reads the code from `geo_locations` rather than
 * trusting this input — validation proves it is a positive integer, not that
 * it is a real city.
 */
export const assignCitySiteLocation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(assignCitySiteLocationSchema)
  .handler(async ({ data, context }) => {
    await CitySiteService.assignLocation({
      projectId: context.projectId,
      citySiteId: data.citySiteId,
      locationCode: data.locationCode,
    });
    return { success: true };
  });

const removeCitySitesSchema = z.object({
  projectId: z.string().min(1),
  // One page's worth at most; the repository chunks these into D1-safe
  // statements, and a larger selection is deleted a page at a time.
  citySiteIds: z.array(z.string().min(1)).min(1).max(200),
});

export const removeCitySites = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeCitySitesSchema)
  .handler(async ({ data, context }) =>
    CitySiteService.remove({
      projectId: context.projectId,
      citySiteIds: data.citySiteIds,
    }),
  );
