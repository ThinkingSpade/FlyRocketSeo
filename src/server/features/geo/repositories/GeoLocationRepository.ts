/**
 * Data access for the `geo_locations` D1 table (seeded offline by
 * scripts/seed-geo-locations.ts — see that script's header for why the table
 * can be empty until an operator has run it).
 *
 * Reads only, and reads D1 only. This repository must never import any
 * metered search-provider client or sibling paid-lookup server function:
 * browsing the location picker (Task 8) must never be able to trigger a paid
 * API call. (Deliberately not naming those modules literally in this comment
 * — the grep that proves this boundary greps for their names, and a match
 * inside a comment describing the rule would be a confusing false positive.)
 */
import { and, count as countFn, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { geoLocations } from "@/db/schema";
import { buildNamePrefixWhere } from "./likePattern";
import { buildTypePriorityOrder } from "./searchOrdering";

type GeoLocationSearchResult = {
  code: number;
  name: string;
  type: string;
  stateCode: string | null;
  countryCode: number;
  // Nullable: not every seeded row sits inside a DMA (e.g. a rural city with
  // no metro), and `geoLocationSeedMapping.ts`'s own resolveParentMetroCode
  // never invents one -- carried through here (added for the target-area
  // detection cascade, Task 4) so a caller can hop from a city to its own
  // metro without a second, separate query shape.
  parentMetroCode: number | null;
};

type SearchInput = {
  query: string;
  countryCode?: number;
  limit: number;
};

/**
 * Prefix search over `name`, optionally scoped to a country, ordered by type
 * priority (a "DMA Region"/"City" row before a "County"/"Postal Code" one)
 * then alphabetically — so "dal" surfaces the Dallas-Ft. Worth metro and
 * Dallas itself before "Dallas County, Alabama". See `buildTypePriorityOrder`
 * (searchOrdering.ts) for why this replaced a `population`-based ordering
 * that shipped as a complete no-op (that column is never populated).
 *
 * The name-matching condition itself — including its ESCAPE clause, which
 * shipped broken in production and is why this search returned zero results
 * for every query — lives in `buildNamePrefixWhere` (likePattern.ts), kept
 * there specifically so it can be tested against a real SQLite engine
 * without this file's own `@/db` import getting in the way (see that
 * function's doc comment).
 */
async function search(input: SearchInput): Promise<GeoLocationSearchResult[]> {
  const nameMatches = buildNamePrefixWhere(geoLocations.name, input.query);
  const where =
    input.countryCode === undefined
      ? nameMatches
      : and(nameMatches, eq(geoLocations.countryCode, input.countryCode));

  return db
    .select({
      code: geoLocations.code,
      name: geoLocations.name,
      type: geoLocations.type,
      stateCode: geoLocations.stateCode,
      countryCode: geoLocations.countryCode,
      parentMetroCode: geoLocations.parentMetroCode,
    })
    .from(geoLocations)
    .where(where)
    .orderBy(buildTypePriorityOrder(geoLocations.type), geoLocations.name)
    .limit(input.limit);
}

/**
 * Total row count — what the Settings page's "Seed location data" section
 * shows before an operator triggers anything, so they can see whether a
 * previous run already finished (or got partway) rather than guessing. Still
 * a plain read: no external call, and reusing this file rather than adding a
 * count to `GeoLocationSeedRepository.ts` keeps every table READ in one
 * place, matching this file's own "reads only" charter — the seed
 * repository stays exclusively about the write path it exists for.
 */
async function count(): Promise<number> {
  const [result] = await db.select({ value: countFn() }).from(geoLocations);
  return result?.value ?? 0;
}

/**
 * Look up a single row by its own primary key. Added for the target-area
 * detection cascade (Task 4 of the activation plan): resolving a business's
 * declared city to its metro is a two-step lookup -- find the city row by
 * name (`search`, above), then follow ITS `parentMetroCode` back to the
 * metro row itself, which `search`'s name-prefix matching cannot do (a DMA's
 * stored name, e.g. "Dallas-Ft. Worth, TX,Texas,United States", does not
 * contain a suburb's name like "Plano"). Still a plain, unconditional read —
 * same "reads only, reads D1 only" charter as `search`.
 */
async function getByCode(
  code: number,
): Promise<GeoLocationSearchResult | null> {
  const rows = await db
    .select({
      code: geoLocations.code,
      name: geoLocations.name,
      type: geoLocations.type,
      stateCode: geoLocations.stateCode,
      countryCode: geoLocations.countryCode,
      parentMetroCode: geoLocations.parentMetroCode,
    })
    .from(geoLocations)
    .where(eq(geoLocations.code, code))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The same read as `getByCode`, for many codes at once. Exists because
 * `RankTrackingDomainList` labels EVERY row from its own stored
 * `locationCode`, and a project may hold up to `MAX_CONFIGS_PER_PROJECT`
 * (500) configs in one unpaginated list -- resolving those one-at-a-time
 * would fan out to one server-function POST per distinct local code on a
 * single list render. Callers pass only the codes that actually need a
 * lookup (a plain `LOCATION_OPTIONS` country code is already named without
 * touching D1), so the common all-country project still issues nothing.
 *
 * Rows come back in whatever order SQLite returns them and codes with no row
 * are simply absent -- callers must key by `code` rather than by position,
 * and treat "absent" exactly as `getByCode`'s null means (unrecognised,
 * never a guess). Still reads only, and reads D1 only.
 *
 * Chunked at `QUERY_CHUNK_SIZE` for the same reason
 * `SavedKeywordTagsRepository` already chunks its own `inArray` reads: each
 * code is a bound parameter, and D1 caps the number of them per statement, so
 * a single 500-code `IN (...)` would throw rather than return a short answer.
 * The cap is on the STATEMENT, not the request, so chunking is what makes the
 * 500-config ceiling actually reachable here.
 */
const QUERY_CHUNK_SIZE = 80;

/** `geo_locations.type` for a city row, as DataForSEO spells it. */
const CITY_LOCATION_TYPE = "City";

/**
 * Names per statement in `searchCitiesByNames`. Half of `QUERY_CHUNK_SIZE`
 * because each name here is a LIKE pattern that can match SEVERAL rows (there
 * are dozens of US cities called Springfield), so this bounds the ROWS coming
 * back as well as the bound parameters going out.
 */
const NAME_QUERY_CHUNK_SIZE = 40;

async function getByCodes(
  codes: readonly number[],
): Promise<GeoLocationSearchResult[]> {
  if (codes.length === 0) return [];
  const rows: GeoLocationSearchResult[] = [];
  for (let i = 0; i < codes.length; i += QUERY_CHUNK_SIZE) {
    const chunk = codes.slice(i, i + QUERY_CHUNK_SIZE);
    const chunkRows = await db
      .select({
        code: geoLocations.code,
        name: geoLocations.name,
        type: geoLocations.type,
        stateCode: geoLocations.stateCode,
        countryCode: geoLocations.countryCode,
        parentMetroCode: geoLocations.parentMetroCode,
      })
      .from(geoLocations)
      .where(inArray(geoLocations.code, [...chunk]));
    rows.push(...chunkRows);
  }
  return rows;
}

/**
 * Every City row whose BARE name is one of `names` — the batch read the city
 * subdomain importer needs, where one call has to resolve up to a chunk's
 * worth of city names at once.
 *
 * Matched with a `<name>,%` prefix rather than a plain `<name>%` because the
 * stored value is DataForSEO's full hierarchy ("Austin,Texas,United States"):
 * the comma is what makes this an EXACT match on the city name instead of a
 * prefix one, so "austin" cannot also drag in "Austinburg". Reuses
 * `buildNamePrefixWhere` for the pattern itself rather than hand-rolling the
 * LIKE — that helper carries the ESCAPE fix that once made every location
 * search in production return zero rows (see likePattern.ts's own header).
 *
 * Deliberately UNLIMITED per chunk. Every other read here caps its rows, but
 * a cap would be a correctness bug in this one: `matchCity` decides "exactly
 * one city carries this name" by counting the rows it is handed, so silently
 * dropping a second Springfield would turn an ambiguous host into a
 * confidently WRONG location code. Bounding the number of NAMES per statement
 * (below) is what keeps the result set small instead.
 *
 * Same charter as every other read in this file: D1 only, no metered provider,
 * nothing written.
 */
async function searchCitiesByNames(input: {
  names: readonly string[];
  countryCode: number;
}): Promise<GeoLocationSearchResult[]> {
  if (input.names.length === 0) return [];

  const rows: GeoLocationSearchResult[] = [];
  // Each name is one more bound parameter on the statement, so this is capped
  // for the same reason getByCodes' own chunking is.
  for (let i = 0; i < input.names.length; i += NAME_QUERY_CHUNK_SIZE) {
    const chunk = input.names.slice(i, i + NAME_QUERY_CHUNK_SIZE);
    const nameMatches = chunk.map((name) =>
      buildNamePrefixWhere(geoLocations.name, `${name},`),
    );
    const chunkRows = await db
      .select({
        code: geoLocations.code,
        name: geoLocations.name,
        type: geoLocations.type,
        stateCode: geoLocations.stateCode,
        countryCode: geoLocations.countryCode,
        parentMetroCode: geoLocations.parentMetroCode,
      })
      .from(geoLocations)
      .where(
        and(
          eq(geoLocations.countryCode, input.countryCode),
          eq(geoLocations.type, CITY_LOCATION_TYPE),
          or(...nameMatches),
        ),
      );
    rows.push(...chunkRows);
  }
  return rows;
}

export const GeoLocationRepository = {
  search,
  count,
  getByCode,
  getByCodes,
  searchCitiesByNames,
} as const;
