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
import { and, count as countFn, eq } from "drizzle-orm";
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

export const GeoLocationRepository = { search, count, getByCode } as const;
