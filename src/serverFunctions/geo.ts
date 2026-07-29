import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GeoLocationRepository } from "@/server/features/geo/repositories/GeoLocationRepository";
import {
  GEO_SEED_ROWS_PER_CHUNK,
  GeoLocationSeedService,
  type GeoLocationSeedChunkResult,
} from "@/server/features/geo/services/GeoLocationSeedService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

/**
 * Free-text location search backing the geo picker (Task 8's
 * GeoLocationSelect). Reads the seeded `geo_locations` D1 table ONLY (see
 * scripts/seed-geo-locations.ts) — no metered provider can ever be reached by
 * browsing the picker. Not project-scoped (this is shared reference data, the
 * same class of lookup as src/shared/keyword-locations.ts's LOCATION_OPTIONS),
 * so this matches src/serverFunctions/config.ts's getSeoApiKeyStatus in using
 * requireAuthenticatedContext rather than requireProjectContext.
 */
const searchGeoLocationsSchema = z.object({
  query: z.string().trim().min(1).max(64),
  countryCode: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const searchGeoLocations = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(searchGeoLocationsSchema)
  .handler(async ({ data }) => {
    return GeoLocationRepository.search(data);
  });

const getGeoLocationByCodeSchema = z.object({
  code: z.number().int().positive(),
});

/**
 * Resolves one `geo_locations` row by its own code -- the free-by-code read
 * added for the target-area detection cascade (GeoLocationRepository.getByCode),
 * now also backing RankTrackingConfigModal.tsx's redisplay of a config saved
 * with a metro/city location. Same "reads only, reads D1 only" guarantee as
 * searchGeoLocations above: no metered provider can be reached by opening an
 * edit modal. Returns null for a code the table has no row for -- the caller
 * must render that as "unrecognised", never a guessed name.
 */
export const getGeoLocationByCode = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(getGeoLocationByCodeSchema)
  .handler(async ({ data }) => {
    return GeoLocationRepository.getByCode(data.code);
  });

/**
 * How many rows `geo_locations` currently holds — the read the Settings
 * page's "Seed location data" section shows before an operator triggers
 * anything, so a previous partial run is visible rather than guessed at.
 * Same `requireAuthenticatedContext` gate as `searchGeoLocations`: this is
 * shared reference data, not project-scoped, and this app has no separate
 * admin/operator role to gate on (see the seed action below for why the UI
 * framing, not a server-side role check, is what marks this an operator
 * surface).
 */
export const getGeoLocationSeedStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    return { rowCount: await GeoLocationRepository.count() };
  });

const seedGeoLocationsChunkSchema = z.object({
  offset: z.number().int().min(0),
});

/**
 * One bounded, resumable slice of the geo_locations seed job — see
 * GeoLocationSeedService.seedChunk's own header for the full chunking
 * rationale. Explicitly triggered only: this does a real (free, per
 * DataForSEO's docs) external fetch plus a bulk D1/Postgres write, so it
 * must never run from a render, a route load, or app start — only from the
 * Settings page's "Seed location data" confirm step, which loops this call
 * client-side (same pattern as AnalyzeProjectCard.tsx) until `done`.
 *
 * Not `requireProjectContext`: like `searchGeoLocations`, this table is
 * shared reference data with no project of its own.
 */
export const seedGeoLocationsChunk = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(seedGeoLocationsChunkSchema)
  .handler(
    async ({ data }): Promise<GeoLocationSeedChunkResult> =>
      GeoLocationSeedService.seedChunk(data.offset, GEO_SEED_ROWS_PER_CHUNK),
  );
