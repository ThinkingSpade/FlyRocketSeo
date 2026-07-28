import { useEffect, useState } from "react";
import type { TargetArea } from "@/shared/geo/types";
import {
  resolveActiveScopeArea,
  resolveDefaultScopeArea,
} from "@/client/features/geo/resolveScopeArea";
import {
  useClearTargetArea,
  useSetTargetArea,
  useTargetArea,
} from "@/client/features/geo/useTargetArea";

export type TargetAreaScope = {
  /** Never null -- see `resolveActiveScopeArea`'s own doc comment. */
  area: TargetArea;
  onChange: (area: TargetArea) => void;
  /** Whether there is an actual confirmed (or just-picked, optimistically)
   *  target area to revert. False for the plain country fallback, where
   *  there is nothing to clear -- gates `ScopeControl`'s "Clear" link. */
  hasConfirmedArea: boolean;
  /** Reverts to the country fallback and clears the project's confirmed
   *  target area entirely -- see `useClearTargetArea`'s own doc comment for
   *  why this is the only way back to "nothing confirmed". */
  onClear: () => void;
};

/**
 * The per-tab "which geography is this tab scoped to" state each of the six
 * affected tabs (Keyword Research, Keyword Trends, SERP Overview, Content
 * Optimizer, Rank Tracking, Topic Clusters) needs for its header
 * `ScopeControl`: the confirmed project target area once it resolves, or the
 * project's own country before that.
 *
 * Follows the SAME locationTouched deferred-sync shape every one of those
 * tabs' existing country `<select>` already uses (see e.g.
 * SerpOverviewPage.tsx's own `locationTouched` effect) so a cold-load render
 * never shows a stale area, and a user's own in-tab pick is never silently
 * overwritten by a slower-arriving confirmation. Pulled out as a shared hook
 * (rather than copy-pasted six times, the way `useDebouncedValue` in
 * `GeoLocationSelect.tsx` stays inline for its one call site) specifically
 * because six near-identical copies would both violate this project's
 * `max-lines-per-function` budget on every page that added it and make the
 * six pages drift from each other over time. Not unit-tested for the same
 * reason `useDebouncedValue` isn't: a hook needs a React render to invoke at
 * all, and there is nothing pure left to extract from it -- the actual
 * logic (`resolveActiveScopeArea`) already has its own test file.
 *
 * Deliberately returns ONLY display/selection state, never anything wired
 * into a metered query: threading the chosen area into an actual fetch is
 * Task 6's job (per-metric labels + `resolveGeo`), not this hook's. Callers
 * must not read `.area` into a metered `queryKey` or `enabled` check.
 */
export function useTargetAreaScope(
  projectId: string,
  countryLocationCode: number,
): TargetAreaScope {
  const targetAreaQuery = useTargetArea(projectId);
  const confirmedArea: TargetArea | null = targetAreaQuery.data?.confirmed
    ? targetAreaQuery.data.area
    : null;
  const confirmedAreaCode = confirmedArea?.locationCode ?? null;
  const setTargetAreaMutation = useSetTargetArea(projectId);
  const clearTargetAreaMutation = useClearTargetArea(projectId);

  const [area, setArea] = useState<TargetArea>(() =>
    resolveActiveScopeArea(confirmedArea, countryLocationCode),
  );
  const [touched, setTouched] = useState(false);

  // Same deferred-arrival problem the country <select> on every one of
  // these tabs already solves: on a cold load neither `["target-area",
  // projectId]` nor `["projects"]` has resolved on first render. Bail once
  // the user has picked their own scope in THIS tab (`touched`). Depending
  // on the primitive `confirmedAreaCode`/`countryLocationCode` (not the
  // `confirmedArea` object) matches every tab's own `locationTouched`
  // effect: an unstable object dependency has caused a real render loop in
  // this codebase before.
  useEffect(() => {
    if (touched) return;
    setArea(resolveActiveScopeArea(confirmedArea, countryLocationCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, confirmedAreaCode, countryLocationCode]);

  const onChange = (next: TargetArea) => {
    setTouched(true);
    setArea(next);
    // Persists as the project's new confirmed primary (the same
    // manual-override path `TargetAreaBanner`'s "Not right?" uses), so every
    // other tab's own ScopeControl picks it up too, next time it mounts.
    // Free (a D1 write, no metered provider, per useSetTargetArea's own doc
    // comment) -- never gated behind an authorization check.
    setTargetAreaMutation.mutate(next);
  };

  const onClear = () => {
    setTouched(true);
    setArea(resolveDefaultScopeArea(countryLocationCode));
    clearTargetAreaMutation.mutate();
  };

  return {
    area,
    onChange,
    // Optimistic (`touched`) as well as server-confirmed: without the
    // `touched` half, clicking "Clear" itself would make the button vanish
    // and instantly reappear once the invalidated query refetches, since
    // `confirmedArea` only updates on that later render.
    hasConfirmedArea: confirmedArea !== null || touched,
    onClear,
  };
}
