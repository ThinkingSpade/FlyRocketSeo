import {
  DEFAULT_LOCATION_CODE,
  isLabsLocationCode,
} from "@/shared/keyword-locations";
import { US_STATES } from "@/shared/us-states.generated";
import { US_CITIES } from "@/shared/us-cities.generated";

/**
 * Server-only: resolves a US state/city geotarget code up to the
 * Labs-supported country code DataForSEO Labs endpoints accept.
 *
 * This lives here rather than in src/shared/keyword-locations.ts for two
 * reasons. It must be synchronous -- it sits on a server request path and
 * can't await the client's lazily-imported city chunk -- and it needs the
 * full city->state parent map, which is the ~1.5 MB table that must NOT
 * reach the browser. A Worker bundle has no such size pressure, so this
 * module imports the generated city table statically.
 */

// code -> parentCode for every US state and city, built once at module load
// so each resolve call is a bounded series of map lookups rather than a
// linear scan of ~19.7k rows per hop.
const PARENT_BY_CODE = new Map<number, number>();
for (const state of US_STATES) {
  PARENT_BY_CODE.set(state.code, state.parentCode);
}
for (const city of US_CITIES) {
  PARENT_BY_CODE.set(city.code, city.parentCode);
}

/**
 * Walks location_code_parent upward (city -> state -> country) until it
 * reaches a code DataForSEO Labs supports, falling back to
 * DEFAULT_LOCATION_CODE if the chain runs out or loops. Two hops for a city
 * is normal -- DataForSEO parents cities to their state, not the country.
 */
export function resolveLabsLocationCode(locationCode: number): number {
  const visited = new Set<number>();
  let current = locationCode;
  while (!visited.has(current)) {
    if (isLabsLocationCode(current)) return current;
    visited.add(current);
    const parent = PARENT_BY_CODE.get(current);
    if (parent === undefined) return DEFAULT_LOCATION_CODE;
    current = parent;
  }
  // A revisited code means a cycle rather than a path to a Labs-supported
  // country; fall back instead of looping forever.
  return DEFAULT_LOCATION_CODE;
}
