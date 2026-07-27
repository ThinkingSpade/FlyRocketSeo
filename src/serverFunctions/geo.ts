import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GeoLocationRepository } from "@/server/features/geo/repositories/GeoLocationRepository";
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
