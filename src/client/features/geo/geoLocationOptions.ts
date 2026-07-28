/**
 * Pure data-shaping for GeoLocationSelect: turning the three synchronous
 * bundled tables (US_DMAS, US_STATES, LOCATION_OPTIONS) plus one async D1
 * search result into the ordered, grouped, keyboard-flattenable rows the
 * picker renders.
 *
 * Kept in its own module with no JSX/React import specifically so it can
 * live under `src/**\/*.test.ts` and get a real regression test — this
 * repo's Vitest runs with `environment: "node"` and collects only
 * `src/**\/*.test.ts`, so any logic worth pinning has to be extractable like
 * this (same reasoning Task 7 already applied to `likePattern.ts`).
 */
import type { TargetArea, TargetAreaKind } from "@/shared/geo/types";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";
import type { searchGeoLocations } from "@/serverFunctions/geo";
import { US_DMAS } from "./usDmas";
import { US_STATES } from "./usStates";

/** The exact row shape `searchGeoLocations` resolves to, read structurally
 * off the server function itself (same pattern as
 * `src/client/hooks/useProjectDomain.ts`'s `ProjectSummary`) so this module
 * can't silently drift from what GeoLocationRepository.search actually
 * returns. */
export type GeoSearchResult = Awaited<
  ReturnType<typeof searchGeoLocations>
>[number];

export type GeoGroupKey = TargetAreaKind;

export type GeoGroup = {
  key: GeoGroupKey;
  heading: string;
  rows: TargetArea[];
};

const GROUP_HEADINGS: Record<GeoGroupKey, string> = {
  metro: "Metros",
  city: "Cities",
  region: "States",
  country: "Countries",
};

// Fixed render order regardless of which groups end up with rows: the most
// useful unit first (a metro/city is what a local business actually wants),
// broader fallbacks last. Matches the design doc's "Metros -> Cities ->
// States -> Countries" order verbatim.
const GROUP_ORDER: readonly GeoGroupKey[] = [
  "metro",
  "city",
  "region",
  "country",
];

/**
 * Metros and states are exclusively US entities (Nielsen DMAs; the 50 states
 * + DC — see usDmas.ts/usStates.ts headers), so their `parentCountryCode` is
 * always the US's own code. Reusing the already-exported product-wide
 * default (documented as 2840, the US's DataForSEO country code) instead of
 * a second literal "2840" here means the two can't drift apart — the same
 * reasoning `useProjectDomain.ts`'s `DEFAULT_MARKET` already applies.
 */
const US_COUNTRY_CODE = DEFAULT_LOCATION_CODE;

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Case-insensitive substring match against any of the given fields — the
 * same semantics `LocationSelect.tsx`'s own `matches()` uses, generalized
 * past two fields so metros/states/countries can share one matcher. An empty
 * query matches everything, so a freshly-opened picker shows the full
 * bundled list rather than a blank one (same behaviour LocationSelect
 * already has today).
 */
function textMatches(
  query: string,
  ...fields: ReadonlyArray<string | null | undefined>
): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return fields.some(
    (field) => field != null && field.toLowerCase().includes(needle),
  );
}

/** Synchronous — no network, no debounce. Matches on the DMA's name (which
 * already embeds its state, e.g. "Dallas-Fort Worth TX") and, defensively,
 * its raw state code. */
export function filterMetroAreas(query: string): TargetArea[] {
  return US_DMAS.filter((dma) =>
    textMatches(query, dma.name, dma.stateCode),
  ).map((dma) => ({
    kind: "metro",
    locationCode: dma.code,
    label: dma.name,
    parentCountryCode: US_COUNTRY_CODE,
  }));
}

/** Synchronous — no network, no debounce. State names are unique on their
 * own (unlike cities), so no disambiguation suffix is needed. */
export function filterStateAreas(query: string): TargetArea[] {
  return US_STATES.filter((state) =>
    textMatches(query, state.name, state.stateCode),
  ).map((state) => ({
    kind: "region",
    locationCode: state.code,
    label: state.name,
    parentCountryCode: US_COUNTRY_CODE,
  }));
}

/** Synchronous — no network, no debounce. */
export function filterCountryAreas(query: string): TargetArea[] {
  return LOCATION_OPTIONS.filter((option) =>
    textMatches(query, option.label, option.shortLabel),
  ).map((option) => ({
    kind: "country",
    locationCode: option.code,
    label: option.label,
    // A country's own parent country is itself — resolveGeo reads this field
    // to pick which country's data answers a national-scope need, and for an
    // explicitly-chosen country that IS the chosen country.
    parentCountryCode: option.code,
  }));
}

/**
 * `stateCode` disambiguates the common case (two same-named US cities in
 * different states, e.g. Springfield IL vs MO); `countryCode` disambiguates
 * the rest, via the same LOCATION_OPTIONS table the rest of this module
 * already treats as the single source of truth for country display names.
 * Falls back to the bare name only when neither is available — never
 * invents a label.
 */
export function formatCityLabel(
  name: string,
  stateCode: string | null,
  countryCode: number,
): string {
  if (stateCode) return `${name}, ${stateCode}`;
  const country = LOCATION_OPTIONS.find(
    (option) => option.code === countryCode,
  );
  return country ? `${name}, ${country.shortLabel}` : name;
}

/**
 * `geo_locations` seeds every Google geotarget type into one table —
 * countries, states, DMAs and cities alike (see
 * scripts/seed-geo-locations.ts) — but metros/states/countries already have
 * their own dedicated, curated sources above. Filtering to "City" here is
 * what stops a seeded deployment from showing e.g. "Texas" twice: once from
 * US_STATES, once from D1.
 */
export function buildCityAreas(
  results: readonly GeoSearchResult[],
): TargetArea[] {
  return results
    .filter((result) => result.type === "City")
    .map((result) => ({
      kind: "city",
      locationCode: result.code,
      label: formatCityLabel(result.name, result.stateCode, result.countryCode),
      parentCountryCode: result.countryCode,
    }));
}

/**
 * A `DMA Region` row from the seeded `geo_locations` table becomes a
 * selectable metro on its own. `US_DMAS` (usDmas.ts) ships intentionally
 * EMPTY — no public, no-credential source publishes Nielsen's licensed DMA
 * codes — so it is an INSTANT accelerator for the un-seeded case, never a
 * whitelist a real seeded row has to clear against. Cross-referencing D1
 * results against `US_DMAS` (as an earlier version of this module did) meant
 * a correctly seeded deployment could never show a single metro, because the
 * one table that could confirm a DMA row was always the empty one. DMA
 * region names already embed their state (e.g. "Dallas-Fort Worth TX", per
 * `filterMetroAreas`'s own comment above), so no extra disambiguation suffix
 * is needed here, matching how the bundled metros format their own label.
 */
export function buildMetroAreasFromSearch(
  results: readonly GeoSearchResult[],
): TargetArea[] {
  return results
    .filter((result) => result.type === "DMA Region")
    .map((result) => ({
      kind: "metro",
      locationCode: result.code,
      label: result.name,
      parentCountryCode: result.countryCode,
    }));
}

/**
 * Whether a debounced query justifies trusting whatever is sitting in a D1
 * search-result cache. Shared by every group backed by `searchGeoLocations`
 * (cities and, now, seeded metros): `@tanstack/query`'s `keepPreviousData`
 * reports the LAST successful result as placeholder data even once the query
 * has been disabled — verified against the installed `@tanstack/query-core`,
 * whose `QueryObserver` only checks `data === undefined && status ===
 * "pending"`, never `enabled` — so after a real, non-empty search resolves
 * (e.g. "dal" -> Dallas) and the user clears the box back to empty, the raw
 * query result would otherwise keep reporting those stale rows forever,
 * attached to a query that no longer says "dal" anywhere. An empty debounced
 * query means "no search has been asked", so it always renders zero rows
 * regardless of what is sitting in the query cache; a non-empty one still
 * shows the rows as-is, which is what lets a genuinely in-flight fetch keep
 * showing the previous batch (no layout jump) while a newer one resolves.
 */
function hasActiveGeoQuery(debouncedQuery: string): boolean {
  return debouncedQuery.trim().length > 0;
}

export function selectCityAreas(
  debouncedQuery: string,
  results: readonly GeoSearchResult[],
): TargetArea[] {
  return hasActiveGeoQuery(debouncedQuery) ? buildCityAreas(results) : [];
}

/** Same gating as `selectCityAreas`, for the metro areas D1 search results
 * seed (see `buildMetroAreasFromSearch`'s own doc comment for why those must
 * not be filtered out just because `US_DMAS` is empty). */
export function selectMetroAreasFromSearch(
  debouncedQuery: string,
  results: readonly GeoSearchResult[],
): TargetArea[] {
  return hasActiveGeoQuery(debouncedQuery)
    ? buildMetroAreasFromSearch(results)
    : [];
}

/** Assembles the ordered, non-empty groups. "A group is omitted entirely
 * when empty" (the design doc's own words) is the whole reason this exists
 * as a separate step rather than always rendering all four headings — the
 * empty `US_DMAS` table makes Metros exactly this case today. */
export function groupGeoAreas(input: {
  metros: readonly TargetArea[];
  cities: readonly TargetArea[];
  states: readonly TargetArea[];
  countries: readonly TargetArea[];
}): GeoGroup[] {
  const rowsByKey: Record<GeoGroupKey, readonly TargetArea[]> = {
    metro: input.metros,
    city: input.cities,
    region: input.states,
    country: input.countries,
  };
  return GROUP_ORDER.filter((key) => rowsByKey[key].length > 0).map((key) => ({
    key,
    heading: GROUP_HEADINGS[key],
    rows: [...rowsByKey[key]],
  }));
}

/** Cross-group order for Up/Down and Enter: the same order the groups
 * render in, minus the headings, so index N here is always index N in the
 * rendered list — crossing a group boundary is just crossing an index. */
export function flattenGeoGroups(groups: readonly GeoGroup[]): TargetArea[] {
  return groups.flatMap((group) => group.rows);
}

/** Stable per-row identity for React keys and keyboard-nav index lookups.
 * `locationCode` alone would already be unique in practice (Google's
 * geotarget codes are one global space), but keying by kind too costs
 * nothing and removes any doubt about a cross-kind collision. */
export function areaKey(area: TargetArea): string {
  return `${area.kind}:${area.locationCode}`;
}

/** Whether `candidate` is the row the picker's current `value` refers to —
 * drives the selected-row checkmark. `value` is nullable (no area chosen
 * yet); `candidate` never is, since it's always a row actually being
 * rendered. */
export function isSameArea(
  value: TargetArea | null,
  candidate: TargetArea,
): boolean {
  return (
    value !== null &&
    value.kind === candidate.kind &&
    value.locationCode === candidate.locationCode
  );
}

/**
 * What to show once every group above comes back empty. This state is
 * genuinely ambiguous in an unseeded deployment: a real city/metro query
 * ("dallas") and a nonsense one ("zzzzzz") both come back as zero rows from
 * every source, because `geo_locations` has zero rows either way — the
 * response shape cannot tell the two situations apart, so claiming "no such
 * place" would be a guess dressed up as fact.
 *
 * Instead this states two separate, individually true things: what WAS
 * actually checked (the bundled states/countries — the only sources that
 * don't depend on seeding), and, unconditionally, that metro and city
 * coverage depends on a seed step. Metros are named specifically, not folded
 * into "city": `US_DMAS` never populates on its own (see that file's own
 * header — no public source publishes the data), so for metros the seed
 * step is not just faster, it is the ONLY way this deployment ever shows one,
 * which is not equally true of cities. The second clause holds regardless of
 * whether *this* particular query would have hit a real metro or city, so it
 * never overclaims in either direction, including a future deployment that
 * HAS been seeded and simply has no match for this query.
 */
export function describeNoGeoMatches(query: string): string {
  const trimmed = query.trim();
  return (
    `No states or countries match “${trimmed}”. Metro and city results ` +
    "depend on this deployment's location data being seeded — from " +
    "Settings ('Location data'), or via scripts/seed-geo-locations.ts for " +
    "a local key — if you expected a metro or city here, that's the most " +
    "likely reason."
  );
}
