/**
 * The location caption for ONE rank-tracking `locationCode`, resolved to a
 * real place name -- the whole `resolveStoredConfigArea` + `useConfigAreaLookup`
 * + `resolveRankTrackingLocationLabel` quartet behind a single call.
 *
 * Extracted from `RankTrackingDetailHeader.tsx`, which was the first surface
 * fixed for the `LOCATIONS[code] ?? "US"` mislabelling (see
 * `rankTrackingLocationLabel.ts`'s own doc comment for the bug), and now
 * shared with `KeywordTrendModal`. `areaTouched` is hardcoded `false` here on
 * purpose and that reasoning should live in exactly one place: neither
 * surface EDITS a location, they only display one, so there is no in-progress
 * user pick a late-arriving lookup could clobber (contrast
 * `RankTrackingConfigModal.tsx`, which uses `useConfigAreaLookup` directly
 * because it does have one).
 *
 * For ONE config only. `RankTrackingDomainList` deliberately does NOT use this
 * -- calling it per row would issue one server-function POST per distinct
 * local code across a list that can hold up to `MAX_CONFIGS_PER_PROJECT` (500)
 * unpaginated rows. That list uses the batched
 * `resolveRankTrackingLocationLabels` + `getGeoLocationsByCodes` pair instead.
 *
 * Cost: nothing at all for a plain `LOCATION_OPTIONS` country code, still the
 * overwhelming majority and every config saved before a7ac8b3 --
 * `useConfigAreaLookup` gates the read behind `needsGeoCodeLookup`. Only a
 * metro/city code spends the free `geo_locations` by-code read.
 *
 * No unit test of its own, matching `useConfigAreaLookup.ts` and
 * `useTargetAreaScope.ts`: a hook needs a React render to invoke at all, and
 * this repo's Vitest collects only `src/**\/*.test.ts` under
 * `environment: "node"`. Everything here that can be wrong without React is
 * in `resolveRankTrackingLocationLabel`, which is covered directly by
 * `rankTrackingLocationLabel.test.ts`.
 */
import { useState } from "react";
import type { TargetArea } from "@/shared/geo/types";
import { resolveStoredConfigArea } from "./rankTrackingConfigArea";
import { resolveRankTrackingLocationLabel } from "./rankTrackingLocationLabel";
import { useConfigAreaLookup } from "./useConfigAreaLookup";

export function useRankTrackingLocationLabel(locationCode: number): string {
  // Seeded once per mount. A `locationCode` that changes underneath a mounted
  // component (browser back/forward between two `$configId` routes, or a
  // filtered list reusing a row) leaves this holding the PREVIOUS code's
  // area; `resolveRankTrackingLocationLabel` is what refuses to trust it,
  // re-deriving the honest placeholder rather than showing the stale name.
  const [resolvedArea, setResolvedArea] = useState<TargetArea>(() =>
    resolveStoredConfigArea(locationCode),
  );
  useConfigAreaLookup(locationCode, false, setResolvedArea);
  return resolveRankTrackingLocationLabel(locationCode, resolvedArea);
}
