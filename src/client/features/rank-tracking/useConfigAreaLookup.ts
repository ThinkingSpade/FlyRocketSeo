import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGeoLocationByCode } from "@/serverFunctions/geo";
import type { TargetArea } from "@/shared/geo/types";
import {
  needsGeoCodeLookup,
  resolveLookedUpConfigArea,
} from "./rankTrackingConfigArea";

/**
 * Resolves an EXISTING rank-tracking config's stored `locationCode` to its
 * real name via the free `geo_locations` by-code read
 * (`GeoLocationRepository.getByCode`, added for the target-area detection
 * cascade), replacing `resolveStoredConfigArea`'s bare "Location #<code>"
 * placeholder once the lookup comes back.
 *
 * Split out of `RankTrackingConfigModal.tsx` purely to keep that component
 * under this codebase's max-lines-per-function budget -- same reasoning
 * that file's own `CostEstimateSummary` is already split out for. A hook
 * needs a React render to invoke at all, so (like `useTargetAreaScope.ts`)
 * there is no separate unit test for this file; the pure resolution logic
 * it calls (`resolveLookedUpConfigArea`, `needsGeoCodeLookup`) already has
 * its own test in `rankTrackingConfigArea.test.ts`.
 *
 * Only fires for a code that ISN'T a plain `LOCATION_OPTIONS` country
 * (`needsGeoCodeLookup`) -- the common case (a plain country pick, or a
 * brand-new config with no `existingConfig` at all) never spends this read.
 * `areaTouched` stops a lookup that resolves late from clobbering a location
 * the user has since picked themselves in the same modal session.
 */
export function useConfigAreaLookup(
  storedLocationCode: number | null,
  areaTouched: boolean,
  setArea: (area: TargetArea) => void,
): void {
  const needsLookup =
    storedLocationCode !== null && needsGeoCodeLookup(storedLocationCode);
  const geoByCodeQuery = useQuery({
    queryKey: ["geo-location-by-code", storedLocationCode],
    // Non-null assertion, not a cast: `enabled` below guarantees this never
    // actually runs while `storedLocationCode` is null (same pattern this
    // codebase already uses for an enabled-gated optional query input, e.g.
    // RankTrackingCard.tsx's own `primary!.id`).
    queryFn: () =>
      getGeoLocationByCode({ data: { code: storedLocationCode! } }),
    enabled: needsLookup,
  });

  useEffect(() => {
    if (areaTouched || !needsLookup || storedLocationCode === null) return;
    // A failed read degrades exactly like a confirmed-absent row does --
    // see rankTrackingConfigArea.ts's own UNRECOGNISED_GEO_CODE_LABEL
    // comment for why the bare-code placeholder must not stand in as the
    // final answer forever.
    if (geoByCodeQuery.data !== undefined) {
      setArea(
        resolveLookedUpConfigArea(storedLocationCode, geoByCodeQuery.data),
      );
    } else if (geoByCodeQuery.isError) {
      setArea(resolveLookedUpConfigArea(storedLocationCode, null));
    }
  }, [
    areaTouched,
    needsLookup,
    storedLocationCode,
    geoByCodeQuery.data,
    geoByCodeQuery.isError,
    setArea,
  ]);
}
