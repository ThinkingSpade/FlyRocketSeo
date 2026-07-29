/**
 * US DMAs (Nielsen media markets, e.g. "Dallas-Fort Worth TX") for the geo
 * picker's metro-level option (Task 8's GeoLocationSelect).
 *
 * Bundled here rather than read from the `geo_locations` D1 table (see
 * src/db/app.schema.ts) for the same reason as usStates.ts in this directory:
 * it wants to be instant, and `src/shared/`/`src/server/` are in the Worker's
 * startup graph this codebase has already been burned by once. Do not import
 * this module from either of those trees.
 *
 * THIS TABLE IS CURRENTLY EMPTY. Populating it with even one code this file
 * cannot independently verify would violate the one hard rule for this data:
 * a wrong geotarget `location_code` fails silently at query time (DataForSEO
 * either 404s deep in a nested response or, worse, silently serves data for
 * the wrong place), which is strictly worse than an obviously incomplete
 * table. So: empty, not guessed.
 *
 * What was actually tried, so the next person does not repeat the same dead
 * ends — four independent, free, no-credential sources were fetched and
 * inspected, and NONE of them contain a single "DMA Region" row for the US:
 *
 *   1. Google's official geotargets CSV, current (2026-07-16) snapshot:
 *      https://developers.google.com/static/google-ads/api/data/geo/geotargets-2026-07-16.csv.zip
 *   2. The same file's 2019-02-11 snapshot (in case DMA rows existed
 *      historically and were later pulled) — also zero.
 *   3. DataForSEO's own published Keywords Data locations CSV, 2026-07-20:
 *      https://cdn.dataforseo.com/v3/locations/locations_kwrd_2026_07_20.csv
 *   4. DataForSEO's SERP-product locations CSV, 2026-07-20:
 *      https://cdn.dataforseo.com/v3/locations/locations_serp_google_2026_07_20.csv
 *
 * All four were parsed and grepped for "DMA" — the only hits were unrelated
 * place names that happen to contain the substring (Boardman, Weidman,
 * Landmark, etc.). This lines up with what both Google's and DataForSEO's own
 * docs pages say in plain text: DMA boundary/name data is Nielsen's
 * commercial property, and neither publisher redistributes it in their free
 * bulk location files — "Contact The Nielsen Company directly for DMA data."
 *
 * That seed has since run: scripts/seed-geo-locations.ts calls the live,
 * authenticated `POST /v3/keywords_data/google_ads/locations` endpoint, which
 * DOES return the "DMA Region"-typed rows the free bulk exports omit, and
 * production's `geo_locations` now holds 210 of them. The picker reads those
 * through `searchGeoLocations` (see buildMetroAreasFromSearch), so this array
 * staying empty costs a seeded deployment nothing.
 *
 * One correction that came out of that seed, recorded here because this file
 * is where the guess was documented: the long-standing 1026339
 * ("Dallas-Fort Worth TX") fixture in ../../../shared/geo/resolveGeo.test.ts
 * and scripts/verify-geo-support.ts was WRONG. 1026339 is the City of Dallas;
 * the Dallas-Ft. Worth DMA is 200623. Both are sub-country geotargets that
 * route to Google Ads, so no assertion ever failed over it — the label was
 * simply false. Both call sites now use 200623.
 */
export const US_DMAS: ReadonlyArray<{
  code: number;
  name: string;
  stateCode?: string;
}> = [];
