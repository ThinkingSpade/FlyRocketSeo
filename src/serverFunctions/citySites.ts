import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CITY_SITE_IMPORT_MAX_HOSTS,
  CitySiteService,
} from "@/server/features/city-sites/services/CitySiteService";
import {
  CityRankTrackingService,
  MAX_CITY_RANK_SETUP,
} from "@/server/features/city-sites/services/CityRankTrackingService";
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
  /**
   * Restrict the page to exactly these hosts.
   *
   * How the client pages an ordering D1 cannot produce: clicks and impressions
   * live in Search Console, so ordering by them happens against the
   * performance map, and this fetches the rows for the resulting slice. Capped
   * at one page's worth, which is all a slice ever is.
   */
  hosts: z.array(z.string().min(1).max(255)).max(200).optional(),
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
      hosts: data.hosts,
      page: data.page,
      pageSize: data.pageSize,
    }),
  );

const citySitePerformanceSchema = z.object({
  projectId: z.string().min(1),
  dateRange: z
    .enum(["last_7_days", "last_28_days", "last_3_months", "last_6_months"])
    .default("last_28_days"),
});

/**
 * Per-city Search Console performance.
 *
 * FREE, like everything else on this page: one first-party Search Console call
 * on the user's own grant, aggregated by hostname. No metered provider is
 * touched, and no per-city property has to exist — a Domain property already
 * reports every subdomain, so one connection covers the whole registry.
 *
 * Deliberately a SEPARATE endpoint from `getCitySites` rather than a field on
 * it. The registry is a local D1 read that should paint immediately; this one
 * waits on Google. Folding them together would put every table render behind a
 * network round trip, which is the waterfall this codebase has already removed
 * from the dashboard once.
 */
export const getCitySitePerformance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(citySitePerformanceSchema)
  .handler(async ({ data, context }) =>
    CitySiteService.getPerformance({
      projectId: context.projectId,
      dateRange: data.dateRange,
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

const cityRankSettingsSchema = z.object({
  projectId: z.string().min(1),
  citySiteIds: z.array(z.string().min(1)).min(1).max(MAX_CITY_RANK_SETUP),
  // One template line each; `{city}`/`{state}` are substituted per city.
  templates: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  devices: z.enum(["both", "desktop", "mobile"]),
  // Matches createConfigSchema's own bounds, since these become real configs.
  serpDepth: z.number().int().min(10).max(100).multipleOf(10),
  interval: z.enum(["daily", "weekly", "monthly", "manual"]),
});

/**
 * What bulk rank tracking WOULD create, and what it would cost per month.
 *
 * FREE and writes nothing. This is the disclosure step: the returned cost
 * comes from the same estimator the billing guard charges against, so the
 * figure someone approves is the figure they are billed.
 */
export const planCityRankTracking = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(cityRankSettingsSchema)
  .handler(async ({ data, context }) =>
    CityRankTrackingService.plan({
      projectId: context.projectId,
      citySiteIds: data.citySiteIds,
      settings: {
        templates: data.templates,
        devices: data.devices,
        serpDepth: data.serpDepth,
        interval: data.interval,
      },
    }),
  );

const cityRankSetupSchema = cityRankSettingsSchema.extend({
  offset: z.number().int().min(0).max(MAX_CITY_RANK_SETUP),
});

/**
 * Creates rank tracking configs for one bounded slice of the plan.
 *
 * SPENDS NOTHING BY ITSELF — creating a config and attaching keywords calls no
 * provider. What recurs is a config with a schedule, which the cron then runs;
 * that is why `planCityRankTracking` exists and why the UI defaults the
 * interval to manual. No check is triggered here, not even for a scheduled
 * config: its first run happens on its schedule.
 *
 * Chunked and resumable for the same Free-plan reason the import is, and safe
 * to re-run because an existing config is skipped rather than duplicated.
 */
export const setupCityRankTracking = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(cityRankSetupSchema)
  .handler(async ({ data, context }) =>
    CityRankTrackingService.setupChunk({
      projectId: context.projectId,
      citySiteIds: data.citySiteIds,
      settings: {
        templates: data.templates,
        devices: data.devices,
        serpDepth: data.serpDepth,
        interval: data.interval,
      },
      offset: data.offset,
    }),
  );

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
