/**
 * Pure row-derivation shared by `scripts/seed-geo-locations.ts` (a local/CI
 * run against a key in `.env.local`) and `GeoLocationSeedService` (the
 * in-Worker path, which reads `DATAFORSEO_API_KEY` through
 * `src/server/lib/runtime-env.ts` — the same helper `dataforseo/core.ts`
 * uses — because the production key is a write-only Cloudflare Worker secret
 * nothing outside the Worker can read back out; see that service's own
 * header). Both populate the SAME `geo_locations` table from the SAME
 * DataForSEO endpoint, so this is the one place the
 * `location_code_parent` -> country/state/metro derivation is written and
 * tested, rather than trusted twice by eye.
 *
 * Kept free of any Worker- or Node-only import so either caller can use it
 * unconditionally: no `cloudflare:workers`, no `node:*`, no `@/db`. The one
 * runtime table this logic needs beyond DataForSEO's own response —
 * `US_STATES`, for state-code resolution — is taken as a parameter rather
 * than imported directly: `src/client/features/geo/usStates.ts`'s own header
 * says plainly "`src/shared/` and `src/server/` are in the Worker's startup
 * graph ... so this module must stay client-only. Do not import it from
 * either of those trees" (the exact cold-start regression this codebase
 * already paid a 33-file refactor to fix). The script supplies `US_STATES`
 * via its existing static import (`scripts/` is never bundled into the
 * Worker); the Worker caller supplies it via a dynamic `import()` instead
 * (see `GeoLocationSeedService.ts`), so the table is only ever pulled into
 * the Worker's memory when a seed run actually executes, never on every cold
 * start.
 */
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";

// ---------------------------------------------------------------------------
// Defensive, never-throws parsing of a single DataForSEO location row.
// `unknown` throughout — every field read through a type-predicate guard,
// never `as`-narrowed — because this is a Google-maintained reference list
// outside this app's control: a malformed or renamed field must degrade to
// "skip this one row", never crash the whole seed run.
// ---------------------------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export type RawLocationRow = {
  location_code?: number;
  location_name?: string;
  location_code_parent?: number;
  country_iso_code?: string;
  location_type?: string;
};

export function toRawLocationRow(value: unknown): RawLocationRow {
  if (!isRecord(value)) return {};
  return {
    location_code: readNumber(value.location_code),
    location_name: readString(value.location_name),
    location_code_parent: readNumber(value.location_code_parent),
    country_iso_code: readString(value.country_iso_code),
    location_type: readString(value.location_type),
  };
}

// ---------------------------------------------------------------------------
// Row derivation. `geo_locations`' country_code/state_code/parent_metro_code
// are not columns DataForSEO hands over directly on every row — they are
// derived by walking each row's `location_code_parent` chain, built once as
// an in-memory map since the whole list arrives in a single response.
// `population` is never provided by this endpoint, so it has no place in
// this type at all (see `src/db/app.schema.ts`'s own comment on that
// column) — no source here can supply it, and an invented number is worse
// than none.
// ---------------------------------------------------------------------------

export type GeoLocationRow = {
  code: number;
  name: string;
  type: string;
  stateCode: string | null;
  parentMetroCode: number | null;
  countryCode: number;
};

/**
 * Builds a Google-location-code -> two-letter state abbreviation lookup from
 * a `US_STATES`-shaped table. A parameter rather than a direct import — see
 * this module's own header for why `usStates.ts` can't be statically
 * imported here.
 */
export function buildUsStateCodeMap(
  usStates: readonly { code: number; stateCode?: string }[],
): ReadonlyMap<number, string> {
  const map = new Map<number, string>();
  for (const state of usStates) {
    if (state.stateCode) map.set(state.code, state.stateCode);
  }
  return map;
}

/**
 * Reuses `LOCATION_OPTIONS`' existing ISO<->Google-country-code pairing
 * (`shortLabel` is the 2-letter ISO code) rather than inventing a second
 * country table here. Safe to import directly (unlike `usStates.ts`):
 * `keyword-locations.ts` carries no cold-start warning and is already
 * imported from a dozen+ places under `src/server`.
 */
function buildIsoToCountryCodeMap(): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const option of LOCATION_OPTIONS) {
    map.set(option.shortLabel, option.code);
  }
  return map;
}

/** Ancestor chain from (not including) `startParent` up to the root, guarded
 * against a cyclic parent reference (should never happen in real data, but
 * the guard is nearly free). */
function walkParents(
  startParent: number | undefined,
  byCode: ReadonlyMap<number, RawLocationRow>,
): RawLocationRow[] {
  const chain: RawLocationRow[] = [];
  const seen = new Set<number>();
  let cursor = startParent;
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = byCode.get(cursor);
    if (!parent) break;
    chain.push(parent);
    cursor = parent.location_code_parent;
  }
  return chain;
}

function resolveCountryCode(
  row: RawLocationRow,
  byCode: ReadonlyMap<number, RawLocationRow>,
  isoToCountryCode: ReadonlyMap<string, number>,
): number | null {
  if (row.location_type === "Country" && row.location_code !== undefined) {
    return row.location_code;
  }
  if (row.country_iso_code) {
    const mapped = isoToCountryCode.get(row.country_iso_code);
    if (mapped !== undefined) return mapped;
  }
  for (const ancestor of walkParents(row.location_code_parent, byCode)) {
    if (
      ancestor.location_type === "Country" &&
      ancestor.location_code !== undefined
    ) {
      return ancestor.location_code;
    }
  }
  return null;
}

function resolveStateCode(
  row: RawLocationRow,
  byCode: ReadonlyMap<number, RawLocationRow>,
  stateCodesByLocationCode: ReadonlyMap<number, string>,
): string | null {
  if (row.location_code !== undefined) {
    const direct = stateCodesByLocationCode.get(row.location_code);
    if (direct) return direct;
  }
  for (const ancestor of walkParents(row.location_code_parent, byCode)) {
    if (ancestor.location_code === undefined) continue;
    const hit = stateCodesByLocationCode.get(ancestor.location_code);
    if (hit) return hit;
  }
  return null;
}

function resolveParentMetroCode(
  row: RawLocationRow,
  byCode: ReadonlyMap<number, RawLocationRow>,
): number | null {
  if (row.location_type === "DMA Region") return null; // a metro has no "parent metro"
  for (const ancestor of walkParents(row.location_code_parent, byCode)) {
    if (
      ancestor.location_type === "DMA Region" &&
      ancestor.location_code !== undefined
    ) {
      return ancestor.location_code;
    }
  }
  return null;
}

/**
 * Turns DataForSEO's flat, parent-linked location list into `geo_locations`
 * rows. Skips (and counts) any row missing `code`/`name`/`type`, or whose
 * country cannot be resolved by any of: itself being a Country row, its own
 * `country_iso_code`, or an ancestor Country row — never invents a value for
 * either case.
 */
export function buildGeoLocationRows(
  raw: readonly RawLocationRow[],
  usStateCodesByLocationCode: ReadonlyMap<number, string>,
): { rows: GeoLocationRow[]; skipped: number } {
  const byCode = new Map<number, RawLocationRow>();
  for (const row of raw) {
    if (row.location_code !== undefined) byCode.set(row.location_code, row);
  }

  const isoToCountryCode = buildIsoToCountryCodeMap();

  const rows: GeoLocationRow[] = [];
  let skipped = 0;

  for (const row of raw) {
    const {
      location_code: code,
      location_name: name,
      location_type: type,
    } = row;
    if (code === undefined || name === undefined || type === undefined) {
      skipped += 1;
      continue;
    }

    const countryCode = resolveCountryCode(row, byCode, isoToCountryCode);
    if (countryCode === null) {
      skipped += 1;
      continue;
    }

    rows.push({
      code,
      name,
      type,
      countryCode,
      stateCode: resolveStateCode(row, byCode, usStateCodesByLocationCode),
      parentMetroCode: resolveParentMetroCode(row, byCode),
    });
  }

  return { rows, skipped };
}

// ---------------------------------------------------------------------------
// Country scoping. WHY this exists, verified rather than assumed:
//
// DataForSEO's unscoped `GET /v3/keywords_data/google_ads/locations` returns
// the ENTIRE Google geotarget list in one response — ~94,933 rows (confirmed
// directly against docs.dataforseo.com/v3/keywords_data/google_ads/locations/
// and an independently DataForSEO-reported `result_count`, not recalled from
// memory). An earlier version of this seed feature always fetched that full
// list because the country-scoped sibling endpoint's exact `$country`
// parameter format was unverified in any worked example, and building around
// a guess seemed like the worse risk. That full-list fetch then broke
// production TWICE even after being redesigned to pay its cost only once per
// run instead of once per chunk (see `GeoLocationSeedService.ts`'s own
// header for the full two-attempt history) — a several-megabyte, ~95k-row
// JSON parse plus per-row ancestor-chain derivation is simply too much
// synchronous CPU-bound work for the Cloudflare Workers Free plan's fixed
// ~10ms-per-invocation ceiling (wrangler.jsonc), no matter how many chunk
// calls it gets spread across.
//
// Re-verifying the country-scoped variant directly (not trusting the old
// "unverified" conclusion a second time) confirms: `GET
// https://api.dataforseo.com/v3/keywords_data/google_ads/locations/$country`,
// with `$country` substituted as a plain, lowercase ISO-2 URL path segment
// (e.g. "us" — DataForSEO's own docs example, and note this differs from
// this codebase's own `LOCATION_OPTIONS.shortLabel` convention of uppercase
// "US"; don't "fix" the casing here to match that). This exactly matches the
// vendored `dataforseo-client` SDK's own shipped implementation of
// `KeywordsDataApi.googleAdsLocationsCountry(country)`
// (`dist/esm/api/KeywordsDataApi.js`: builds
// `/v3/keywords_data/google_ads/locations/{country}`, then
// `url_.replace("{country}", encodeURIComponent("" + country))`, plain GET,
// no request body), and returns the identical `tasks[].result[]` row shape
// as the unscoped endpoint — no changes needed anywhere else in this file's
// row-derivation logic, only to what gets fetched.
//
// `buildGoogleAdsLocationsPath` is the one function that builds this path,
// imported by both `GeoLocationSeedService.ts` (the in-Worker path) and
// `scripts/seed-geo-locations.ts` (the CLI path) — a shared helper rather
// than duplicated string interpolation, so the two callers can never drift
// onto two different path formats for the same endpoint.
// ---------------------------------------------------------------------------

/**
 * "us" specifically, not just "whichever country is smallest": this app's
 * actual, documented data gap is US DMA/metro rows (Nielsen-licensed,
 * present in NO free bulk export this codebase could find — see
 * `usDmas.ts`'s own header for the four sources checked). The 50 US states
 * already ship bundled (`usStates.ts`), and every other country this app
 * supports already has *some* usable location data via `LOCATION_OPTIONS`.
 * So scoping to the one country this product actually needs isn't a
 * workaround forced by the CPU ceiling — it happens to be exactly the data
 * the real gap calls for anyway.
 *
 * To widen this later (e.g. a self-hoster who also wants non-US metro/city
 * granularity): change this constant, or — better, if that's ever actually
 * needed — loop over a small list of countries and stage/write each one as
 * its own independent run, so any single fetch+parse+derive pass stays
 * bounded regardless of how many countries eventually get seeded. Do not
 * revert to the unscoped endpoint to "seed everything at once" — that is
 * the exact design this comment's history shows failing twice.
 */
export const GEO_SEED_COUNTRY = "us";

/**
 * Builds the request path for DataForSEO's country-scoped Google Ads
 * locations endpoint — see the "Country scoping" block above for the
 * verified request shape this mirrors. `encodeURIComponent` matches the
 * vendored SDK's own `googleAdsLocationsCountry` implementation exactly,
 * even though a bare lowercase ISO-2 code never actually needs escaping:
 * cheap insurance against `GEO_SEED_COUNTRY` ever being widened to a value
 * that does.
 */
export function buildGoogleAdsLocationsPath(country: string): string {
  return `/v3/keywords_data/google_ads/locations/${encodeURIComponent(country)}`;
}

// ---------------------------------------------------------------------------
// Chunking. Even scoped to one country, the fetched list is large enough
// (unverified exact size — no DataForSEO key is available in this
// environment to measure it; see `GeoLocationSeedService.ts`'s own header)
// that writing it in one Worker invocation would risk both the Cloudflare
// Free plan's ~50-subrequest-per-request ceiling and its fixed CPU-time
// ceiling — this codebase has already been broken by exactly this class of
// limit once elsewhere (see `siteAuditWorkflowFallback.ts`), and the geo
// seed's own unscoped fetch broke it twice more. `sliceGeoLocationRowsChunk`
// bounds a single invocation's write to `chunkSize` rows and reports whether
// more remain, so the caller can repeat the call — client-driven, like
// `AnalyzeProjectCard` — until the whole list is written.
// ---------------------------------------------------------------------------

// Not exported: nothing outside this module needs the type by name, only
// `sliceGeoLocationRowsChunk`'s structural return value (callers destructure
// it directly) — naming it is purely so this function's own signature below
// stays readable.
type GeoLocationRowsChunk = {
  chunk: GeoLocationRow[];
  /** Cursor to pass as `offset` on the next call. */
  writtenSoFar: number;
  done: boolean;
};

export function sliceGeoLocationRowsChunk(
  rows: readonly GeoLocationRow[],
  offset: number,
  chunkSize: number,
): GeoLocationRowsChunk {
  // Clamped defensively so an out-of-range offset (a stale client cursor
  // replayed after the upstream list shrank) can never produce a negative
  // slice or a `writtenSoFar` past `rows.length` — it just reports `done`.
  const safeOffset = Math.max(0, Math.min(offset, rows.length));
  const chunk = rows.slice(safeOffset, safeOffset + Math.max(0, chunkSize));
  const writtenSoFar = safeOffset + chunk.length;
  return { chunk, writtenSoFar, done: writtenSoFar >= rows.length };
}
