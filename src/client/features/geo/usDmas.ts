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
 * The one number that looks like a plausible DMA code anywhere near this
 * codebase is 1026339 ("Dallas-Fort Worth TX"), used as a test fixture in
 * ../../../shared/geo/resolveGeo.test.ts and scripts/verify-geo-support.ts.
 * It is deliberately NOT copied into this file: those two call sites only
 * need *some* number to exercise resolveGeo's branching logic, so being wrong
 * would be harmless there, but a wrong number here reaches a real picker a
 * real user clicks. That fixture has never actually been confirmed against
 * the live API in this environment (no DATAFORSEO_API_KEY has ever been
 * configured here — see .superpowers/sdd/geo-t1-t2-report.md) — it is a
 * plan-time assumption, not a verified fact, and it stays that way until
 * something actually checks it.
 *
 * The real fix: scripts/seed-geo-locations.ts (Task 6) calls the live,
 * authenticated `POST /v3/keywords_data/google_ads/locations` endpoint, which
 * — per that script's own already-written expectations — returns "DMA
 * Region"-typed rows that the free bulk exports above omit. That endpoint,
 * not this file, is the only channel that actually has this data. Once it has
 * run at least once, extend this array from its output (or read a small
 * number of its rows here as a documented example — do not hand-copy the
 * whole thing).
 */
export const US_DMAS: ReadonlyArray<{
  code: number;
  name: string;
  stateCode?: string;
}> = [];
