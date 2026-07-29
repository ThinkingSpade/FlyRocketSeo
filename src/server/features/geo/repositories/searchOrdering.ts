import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * `GeoLocationRepository.search`'s ORDER BY used to be
 * `population DESC NULLS LAST, name` -- but `geo_locations.population` is
 * NEVER populated: DataForSEO's `keywords_data/google_ads/locations`
 * endpoint (the one and only source `scripts/seed-geo-locations.ts` and
 * `GeoLocationSeedService` read from) simply has no such field on any row --
 * verified against the vendored `dataforseo-client` SDK's own
 * `KeywordsDataGoogleAdsLocationsCountryResultInfo`/
 * `KeywordsDataGoogleAdsLocationsResultInfo` models, which list exactly
 * `location_code` / `location_name` / `location_code_parent` /
 * `country_iso_code` / `location_type` and nothing resembling a population
 * figure (see also `geoLocationSeedMapping.ts`'s own `GeoLocationRow`
 * comment, which already documented this). With every row's `population`
 * NULL, `ORDER BY population DESC NULLS LAST` was a complete no-op and the
 * search silently fell back to pure alphabetical order -- which is why
 * typing "dallas" buried the Dallas-Ft. Worth DMA metro and Dallas, TX
 * itself under an alphabetically-earlier run of "Dallas Center, Iowa" and
 * several "Dallas County" rows, and (since `CITY_SEARCH_LIMIT` truncates the
 * result set before the client ever filters to City/DMA Region) could push
 * the metro/city rows a user actually wants past the cutoff entirely on a
 * common prefix.
 *
 * This replaces that dead ordering with the one signal every seeded row
 * genuinely has: its own `type`. Every consumer of `GeoLocationRepository
 * .search` (the picker's `geoLocationOptions.ts`, and
 * `TargetAreaService.resolveAreaForPlaceName`) only ever uses "City" and
 * "DMA Region" rows -- "County", "Postal Code" and everything else are
 * fetched but always discarded downstream -- so ranking those two types
 * first isn't just cosmetic, it keeps the useful rows inside the LIMIT.
 * Ties within a priority tier fall back to `name` (alphabetical), same as
 * the old ordering's own tie-break.
 */
export function buildTypePriorityOrder(typeColumn: SQLWrapper): SQL {
  return sql`CASE
    WHEN ${typeColumn} IN ('DMA Region', 'City') THEN 0
    WHEN ${typeColumn} IN ('County', 'Postal Code') THEN 1
    ELSE 2
  END`;
}
