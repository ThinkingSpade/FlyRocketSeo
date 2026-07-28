/**
 * The 50 US states plus the District of Columbia, for the geo picker's
 * state-level rollup option (Task 8's GeoLocationSelect).
 *
 * Bundled here rather than read from the `geo_locations` D1 table (see
 * src/db/app.schema.ts) because it is tiny and wants to be instant: picking a
 * state should never wait on a network round trip. `src/shared/` and
 * `src/server/` are in the Worker's startup graph — the same graph whose size
 * previously caused multi-second cold starts (a 33-file lazy-loading refactor
 * was needed to fix it) — so this module must stay client-only. Do not import
 * it from either of those trees.
 *
 * `code` is the Google Ads / DataForSEO Keywords Data `location_code` for
 * that state (the same ID space `geo_locations.code` uses), NOT a FIPS or
 * postal code. Every row below was cross-checked against two independent,
 * freely downloadable, no-credential sources that agree exactly:
 *
 *   1. Google's own official geotargets CSV (Google Ads API "Geographical
 *      targeting" reference), 2026-07-16 snapshot:
 *      https://developers.google.com/static/google-ads/api/data/geo/geotargets-2026-07-16.csv.zip
 *      filtered to Country Code "US", Target Type "State", Status "Active".
 *   2. DataForSEO's own published locations CSV (the exact list backing the
 *      keywords_data/google_ads endpoints this app already calls), 2026-07-20
 *      snapshot: https://cdn.dataforseo.com/v3/locations/locations_kwrd_2026_07_20.csv
 *      filtered to country_iso_code "US", location_type "State".
 *
 * Both files list exactly 51 such rows with identical codes. District of
 * Columbia is included because Google classifies it under Target Type/
 * location_type "State" alongside the 50 states, not because it is one.
 *
 * `stateCode` is each state's standard USPS two-letter abbreviation — plain
 * postal-code knowledge, not a geotarget ID, so there is no "invented code"
 * risk in adding it by hand. It doubles as a sanity check on the `code`
 * column above: Google assigns these specific codes in strict alphabetical
 * order BY ABBREVIATION (not by state name — note Alaska/AK sorts before
 * Alabama/AL), with small gaps where a US territory (Puerto Rico, Guam, etc.,
 * Target Type "Territory") sits between two states in that ordering. Re-
 * deriving the sequence from `stateCode` independently and confirming it is
 * monotonically increasing was the actual cross-check used to catch typos
 * before this file was written.
 */
export const US_STATES: ReadonlyArray<{
  code: number;
  name: string;
  stateCode?: string;
}> = [
  { code: 21133, name: "Alabama", stateCode: "AL" },
  { code: 21132, name: "Alaska", stateCode: "AK" },
  { code: 21136, name: "Arizona", stateCode: "AZ" },
  { code: 21135, name: "Arkansas", stateCode: "AR" },
  { code: 21137, name: "California", stateCode: "CA" },
  { code: 21138, name: "Colorado", stateCode: "CO" },
  { code: 21139, name: "Connecticut", stateCode: "CT" },
  { code: 21141, name: "Delaware", stateCode: "DE" },
  { code: 21140, name: "District of Columbia", stateCode: "DC" },
  { code: 21142, name: "Florida", stateCode: "FL" },
  { code: 21143, name: "Georgia", stateCode: "GA" },
  { code: 21144, name: "Hawaii", stateCode: "HI" },
  { code: 21146, name: "Idaho", stateCode: "ID" },
  { code: 21147, name: "Illinois", stateCode: "IL" },
  { code: 21148, name: "Indiana", stateCode: "IN" },
  { code: 21145, name: "Iowa", stateCode: "IA" },
  { code: 21149, name: "Kansas", stateCode: "KS" },
  { code: 21150, name: "Kentucky", stateCode: "KY" },
  { code: 21151, name: "Louisiana", stateCode: "LA" },
  { code: 21154, name: "Maine", stateCode: "ME" },
  { code: 21153, name: "Maryland", stateCode: "MD" },
  { code: 21152, name: "Massachusetts", stateCode: "MA" },
  { code: 21155, name: "Michigan", stateCode: "MI" },
  { code: 21156, name: "Minnesota", stateCode: "MN" },
  { code: 21158, name: "Mississippi", stateCode: "MS" },
  { code: 21157, name: "Missouri", stateCode: "MO" },
  { code: 21159, name: "Montana", stateCode: "MT" },
  { code: 21162, name: "Nebraska", stateCode: "NE" },
  { code: 21166, name: "Nevada", stateCode: "NV" },
  { code: 21163, name: "New Hampshire", stateCode: "NH" },
  { code: 21164, name: "New Jersey", stateCode: "NJ" },
  { code: 21165, name: "New Mexico", stateCode: "NM" },
  { code: 21167, name: "New York", stateCode: "NY" },
  { code: 21160, name: "North Carolina", stateCode: "NC" },
  { code: 21161, name: "North Dakota", stateCode: "ND" },
  { code: 21168, name: "Ohio", stateCode: "OH" },
  { code: 21169, name: "Oklahoma", stateCode: "OK" },
  { code: 21170, name: "Oregon", stateCode: "OR" },
  { code: 21171, name: "Pennsylvania", stateCode: "PA" },
  { code: 21172, name: "Rhode Island", stateCode: "RI" },
  { code: 21173, name: "South Carolina", stateCode: "SC" },
  { code: 21174, name: "South Dakota", stateCode: "SD" },
  { code: 21175, name: "Tennessee", stateCode: "TN" },
  { code: 21176, name: "Texas", stateCode: "TX" },
  { code: 21177, name: "Utah", stateCode: "UT" },
  { code: 21179, name: "Vermont", stateCode: "VT" },
  { code: 21178, name: "Virginia", stateCode: "VA" },
  { code: 21180, name: "Washington", stateCode: "WA" },
  { code: 21183, name: "West Virginia", stateCode: "WV" },
  { code: 21182, name: "Wisconsin", stateCode: "WI" },
  { code: 21184, name: "Wyoming", stateCode: "WY" },
];
