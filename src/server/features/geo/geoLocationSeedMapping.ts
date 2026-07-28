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
// Chunking. A single DataForSEO response holds the ENTIRE Google geotarget
// list (tens of thousands of rows — DataForSEO's own docs describe roughly
// 95k across every country combined) with no verified, documented way to ask
// this endpoint for less (see `GeoLocationSeedService.ts`'s own header for
// why an undocumented-by-example `/locations/$country` path variant exists
// but isn't relied on here). Writing all of it in one Worker invocation would
// exceed both the Cloudflare Free plan's ~50-subrequest-per-request ceiling
// and its fixed CPU-time ceiling — this codebase has already been broken by
// exactly this class of limit once (see `siteAuditWorkflowFallback.ts`).
// `sliceGeoLocationRowsChunk` bounds a single invocation's write to
// `chunkSize` rows and reports whether more remain, so the caller can repeat
// the call — client-driven, like `AnalyzeProjectCard` — until the whole list
// is written.
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
