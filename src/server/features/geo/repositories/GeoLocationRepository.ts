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
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { geoLocations } from "@/db/schema";
import { buildNamePrefixPattern } from "./likePattern";

type GeoLocationSearchResult = {
  code: number;
  name: string;
  type: string;
  stateCode: string | null;
  countryCode: number;
};

type SearchInput = {
  query: string;
  countryCode?: number;
  limit: number;
};

/**
 * Prefix search over `name`, optionally scoped to a country, ordered by
 * population (bigger places first) with unpopulated rows sorting last, then
 * alphabetically — so "dal" surfaces Dallas before the much-smaller Dalton.
 * `ESCAPE '\'` pairs with buildNamePrefixPattern's own escaping of `%`/`_`/`\`
 * so a place name containing one of those characters can't be mismatched
 * against as a wildcard.
 */
async function search(input: SearchInput): Promise<GeoLocationSearchResult[]> {
  const pattern = buildNamePrefixPattern(input.query);
  const nameMatches = sql`${geoLocations.name} LIKE ${pattern} ESCAPE '\'`;
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
    })
    .from(geoLocations)
    .where(where)
    .orderBy(sql`${geoLocations.population} DESC NULLS LAST`, geoLocations.name)
    .limit(input.limit);
}

export const GeoLocationRepository = { search } as const;
