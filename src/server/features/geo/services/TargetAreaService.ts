/**
 * Orchestrates the target-area feature (Task 4 of
 * docs/superpowers/plans/2026-07-28-local-geo-targeting-activation.md):
 * reading the confirmed area (or running the free-signal detection cascade
 * when there isn't one yet), and the three ways an area becomes confirmed --
 * accepting a detected proposal, overriding it from the picker, or clearing
 * it.
 *
 * NO METERED SPEND. Every signal this file reads is free:
 * `LocalSeoService.getCachedBusinessContext` reads an already-cached GBP
 * profile (never triggers a fresh business-info fetch from the paid
 * provider); `GscService.getPerformance` is a first-party Search Console API
 * call, the same free call the Search Performance tab itself makes;
 * `GeoLocationRepository` reads D1 only. This file must never import that
 * paid provider's client — grepping this directory for its module name
 * should surface it ONLY in the seed path (geoLocationSeedMapping.ts /
 * GeoLocationSeedService.ts), never here. (Deliberately not spelling the
 * provider's name in this comment — same reasoning GeoLocationRepository.ts's
 * own header gives: a match inside a comment describing the rule would be a
 * confusing false positive in that very grep.)
 *
 * THE INVARIANT: `getTargetArea` (the read path) NEVER calls
 * `TargetAreaRepository.setPrimary` — the only function that writes
 * `confirmedAt` (see that repository's own header). Detection re-runs fresh
 * on every call rather than ever being persisted as a row, specifically so
 * there is no code path here that could accidentally promote a proposal to
 * confirmed. Only `confirmTargetArea` (accepting a detected proposal) and
 * `setTargetArea` (the manual picker override, confirmed immediately per the
 * spec) call it — see TargetAreaService.test.ts's "never auto-confirms"
 * describe block for the assertion this shape exists to make possible.
 */
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { LocalSeoService } from "@/server/features/local-seo/services/LocalSeoService";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { toQueryPageRows } from "@/server/features/gsc/searchPerformanceReport";
import {
  getLocalLandingPages,
  landingTopic,
} from "@/client/features/search-performance/projectGscInsights";
import { GeoLocationRepository } from "@/server/features/geo/repositories/GeoLocationRepository";
import {
  TargetAreaRepository,
  type TargetAreaRow,
  type TargetAreaSource,
} from "@/server/features/geo/repositories/TargetAreaRepository";
import {
  detectTargetArea,
  type DetectTargetAreaInput,
  type TargetAreaProposal,
} from "@/server/features/geo/detectTargetArea";
import { toCityLabel, toGeoDisplayName } from "@/shared/geo/geoDisplayName";
import { DEFAULT_LOCATION_CODE } from "@/shared/keyword-locations";
import type { TargetArea } from "@/shared/geo/types";

// geo_locations is seeded US-only today (see geoLocationSeedMapping.ts's
// "Country scoping" block) -- every free-signal lookup below is scoped to
// this country for the same reason GeoLocationSeedService's own seed fetch
// is.
const US_COUNTRY_CODE = DEFAULT_LOCATION_CODE;

// A name lookup for a handful of candidate place names per project, not the
// picker's own user-typed search -- no reason to widen this.
const GEO_LOOKUP_LIMIT = 10;

// A ["query","page"] fetch just to spot local landing pages needs far fewer
// rows than the Search Performance tab's own striking-distance scan (1000):
// this only feeds getLocalLandingPages' own top-5-by-impressions result.
const GSC_SIGNAL_ROW_LIMIT = 500;

export type TargetAreaResult =
  | {
      confirmed: true;
      area: TargetArea;
      source: TargetAreaSource;
      confirmedAt: string;
    }
  | { confirmed: false; proposal: TargetAreaProposal }
  | null;

function toTargetArea(row: TargetAreaRow): TargetArea {
  return {
    kind: row.kind,
    locationCode: row.locationCode,
    label: row.label,
    parentCountryCode: row.parentCountryCode,
  };
}

/**
 * Case/whitespace-insensitive comparison key for a raw name segment (a
 * seeded row's own city/state text, or a caller-supplied place name/region).
 */
function normalizePlaceName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The "place" segment of a seeded row's own `name` hierarchy (DataForSEO's
 * format, e.g. "Plano,Texas,United States") -- always the first comma
 * segment for a City row (verified 3-segment shape: place, state, country --
 * see `toGeoDisplayName`'s own header for the same convention; a DMA row's
 * extra embedded ", <ST>" segment never applies here since this is only ever
 * called on `type === "City"` rows).
 */
function cityRowPlace(name: string): string {
  return name.split(",")[0]?.trim() ?? "";
}

/**
 * The "state" segment of a seeded City row's own `name` -- the second of its
 * verified 3 segments. Returns null for a shorter-than-expected name (should
 * never happen for a real seeded City row) rather than throwing: detection
 * degrading to "no state known" beats a crash over malformed data.
 */
function cityRowState(name: string): string | null {
  const segments = name.split(",").map((segment) => segment.trim());
  return segments.length >= 3 ? (segments[1] ?? null) : null;
}

/**
 * True when `row` names the same state as `region` -- checked against both
 * the row's own state-name segment (e.g. "Texas") and its `stateCode` (e.g.
 * "TX"), since GBP's `region` field and a seeded row's own `stateCode`
 * column don't share one format, and this codebase has no free, server-safe
 * state-name<->abbreviation table to normalise between them (`usStates.ts`
 * is client-only, see its own header) -- checking both of the row's own
 * representations against whatever format the evidence turns out to be in
 * costs nothing and avoids inventing one.
 */
function rowMatchesRegion(
  row: { name: string; stateCode: string | null },
  region: string,
): boolean {
  const normalizedRegion = normalizePlaceName(region);
  const stateSegment = cityRowState(row.name);
  if (stateSegment && normalizePlaceName(stateSegment) === normalizedRegion) {
    return true;
  }
  return (
    row.stateCode !== null &&
    normalizePlaceName(row.stateCode) === normalizedRegion
  );
}

/** The one row in `rows`, or null when there are zero OR more than one --
 *  ambiguity is never broken by picking whichever sorts first. */
function resolveUnambiguousMatch<T>(rows: readonly T[]): T | null {
  return rows.length === 1 ? (rows[0] ?? null) : null;
}

/**
 * Resolves a free-text place name (a GBP city, or a name extracted from a
 * local landing page's URL) to a seeded `geo_locations` row -- and, when
 * that row sits inside a DMA, hops to the metro itself via
 * `parentMetroCode`, since the business address is the SIGNAL but the metro
 * is the useful UNIT for keyword/SERP targeting (the activation plan's own
 * worked example: a Plano, TX business proposes "Dallas-Ft. Worth, TX", not
 * the narrower city).
 *
 * Requires an EXACT match on the row's own city-name segment -- never a bare
 * prefix hit off `GeoLocationRepository.search`'s own LIKE query (that same
 * search also has to answer "dal" with "Dallas" for the picker; resolving a
 * detection candidate is a different, stricter question: IS this literal
 * name seeded, not "what starts with it"). When `region` is available (GBP
 * supplies one; a place name scraped from a landing-page URL never does --
 * see this function's own callers), an exact city match must ALSO name that
 * same state (`rowMatchesRegion`). Any remaining ambiguity -- several exact
 * matches, no region to break the tie -- resolves to `null` rather than the
 * biggest city: the confirmation banner attributes a proposal to its
 * specific source ("from your Google Business Profile"), so silently
 * substituting a same-named city in the wrong state would show the user a
 * market their own evidence never actually named.
 */
async function resolveAreaForPlaceName(
  placeName: string,
  region: string | null,
): Promise<TargetArea | null> {
  const results = await GeoLocationRepository.search({
    query: placeName,
    countryCode: US_COUNTRY_CODE,
    limit: GEO_LOOKUP_LIMIT,
  });
  const normalizedPlaceName = normalizePlaceName(placeName);
  const exactMatches = results.filter(
    (row) =>
      row.type === "City" &&
      normalizePlaceName(cityRowPlace(row.name)) === normalizedPlaceName,
  );
  const candidates = region
    ? exactMatches.filter((row) => rowMatchesRegion(row, region))
    : exactMatches;
  const best = resolveUnambiguousMatch(candidates);
  if (!best) return null; // No seeded row, or still ambiguous -- never a guess.

  if (best.parentMetroCode !== null) {
    const metro = await GeoLocationRepository.getByCode(best.parentMetroCode);
    if (metro) {
      return {
        kind: "metro",
        locationCode: metro.code,
        label: toGeoDisplayName(metro.name, metro.type),
        parentCountryCode: metro.countryCode,
      };
    }
  }

  return {
    kind: "city",
    locationCode: best.code,
    label: toCityLabel(best),
    parentCountryCode: best.countryCode,
  };
}

/**
 * Signal 1: the business's own declared address, from a CACHED Google
 * Business Profile only (never a fresh fetch -- see this file's own
 * no-metered-spend header). Returns the raw city/region alongside the
 * resolved area so the GSC signal below can reuse them as corroborating
 * `locationCandidates` for `getLocalLandingPages`, matching
 * `LocalProjectContext.tsx`'s existing convention for combining the two.
 */
async function collectGbpSignal(
  projectId: string,
  billingCustomer: BillingCustomerContext,
): Promise<{
  area: TargetArea | null;
  city: string | null;
  region: string | null;
}> {
  const cached = await LocalSeoService.getCachedBusinessContext(
    projectId,
    billingCustomer,
  );
  const city = cached?.profile.city ?? null;
  const region = cached?.profile.region ?? null;
  const area = city ? await resolveAreaForPlaceName(city, region) : null;
  return { area, city, region };
}

/** True for both "no GSC connection" and "a dead/denied grant" -- either
 *  way there is no signal to read, not an error worth failing detection
 *  over (same distinction searchPerformance.ts's own
 *  isExpectedConnectionFailure draws for the tab itself). */
function isMissingGscSignal(error: unknown): boolean {
  return error instanceof GscNotConnectedError || isExpectedGrantFailure(error);
}

/**
 * Signal 2: Search Console local-landing-page evidence. A plain first-party
 * GSC fetch (free, the same class of call the Search Performance tab
 * already makes), reusing `getLocalLandingPages`/`landingTopic` rather than
 * re-deriving the same pattern-matching a second time. No GSC connection (or
 * a dead/denied grant) resolves to an empty signal, exactly like a project
 * with no GBP -- never thrown, since detection running with fewer signals is
 * the expected, common case, not a fault.
 */
async function collectGscSignal(
  projectId: string,
  knownCity: string | null,
  knownRegion: string | null,
): Promise<TargetArea[]> {
  const { startDate, endDate } = resolveDateRange({});
  let queryPages: ReturnType<typeof toQueryPageRows>;
  try {
    const result = await GscService.getPerformance({
      projectId,
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: GSC_SIGNAL_ROW_LIMIT,
    });
    queryPages = toQueryPageRows(result.rows);
  } catch (error) {
    if (isMissingGscSignal(error)) return [];
    throw error;
  }

  const localPages = getLocalLandingPages({ queryPages }, [
    knownCity,
    knownRegion,
  ]);
  const areas: TargetArea[] = [];
  for (const page of localPages) {
    const placeName = landingTopic(page.page);
    if (!placeName) continue;
    // A URL slug carries no state text at all (unlike GBP's own city+region
    // pair above) -- explicitly null, not an omitted argument standing in
    // for one, so this caller can never be confused for "region unknown
    // because it wasn't checked yet".
    const area = await resolveAreaForPlaceName(placeName, null);
    if (area) areas.push(area);
  }
  return areas; // detectTargetArea de-dupes by locationCode itself.
}

async function detectProposal(
  projectId: string,
  billingCustomer: BillingCustomerContext,
): Promise<TargetAreaProposal | null> {
  const gbp = await collectGbpSignal(projectId, billingCustomer);
  const gscCandidates = await collectGscSignal(projectId, gbp.city, gbp.region);
  const cascadeInput: DetectTargetAreaInput = {
    gbpCandidate: gbp.area,
    gscCandidates,
  };
  return detectTargetArea(cascadeInput);
}

function findConfirmedPrimary(
  rows: readonly TargetAreaRow[],
): (TargetAreaRow & { confirmedAt: string }) | undefined {
  return rows.find(
    (row): row is TargetAreaRow & { confirmedAt: string } =>
      row.isPrimary && row.confirmedAt !== null,
  );
}

/**
 * The confirmed primary area, the pending proposal, or null -- never a
 * write. See this file's own header for why detection is re-run fresh here
 * rather than ever persisted.
 */
async function getTargetArea(
  input: { projectId: string },
  billingCustomer: BillingCustomerContext,
): Promise<TargetAreaResult> {
  const rows = await TargetAreaRepository.listByProject(input.projectId);
  const confirmedPrimary = findConfirmedPrimary(rows);
  if (confirmedPrimary) {
    return {
      confirmed: true,
      area: toTargetArea(confirmedPrimary),
      source: confirmedPrimary.source,
      confirmedAt: confirmedPrimary.confirmedAt,
    };
  }

  const proposal = await detectProposal(input.projectId, billingCustomer);
  return proposal ? { confirmed: false, proposal } : null;
}

/** Accepts a detected proposal. One of exactly two functions in this file
 *  that ever write `confirmedAt` (the other is `setTargetArea`). */
async function confirmTargetArea(input: {
  projectId: string;
  area: TargetArea;
  source: "gbp" | "gsc";
}): Promise<TargetArea> {
  await TargetAreaRepository.setPrimary({
    projectId: input.projectId,
    ...input.area,
    source: input.source,
  });
  return input.area;
}

/** Manual override from the picker -- confirmed immediately, per the spec.
 *  Always writes `source: "manual"`; Task 5's "Not right?" flow never gets
 *  to choose a different source through this path. */
async function setTargetArea(input: {
  projectId: string;
  area: TargetArea;
}): Promise<TargetArea> {
  await TargetAreaRepository.setPrimary({
    projectId: input.projectId,
    ...input.area,
    source: "manual",
  });
  return input.area;
}

async function clearTargetArea(input: { projectId: string }): Promise<void> {
  await TargetAreaRepository.clearByProject(input.projectId);
}

export const TargetAreaService = {
  getTargetArea,
  confirmTargetArea,
  setTargetArea,
  clearTargetArea,
} as const;
