import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  clearTargetArea,
  confirmTargetArea,
  getTargetArea,
  setTargetArea,
} from "@/serverFunctions/targetAreas";
import type { TargetAreaResult } from "@/server/features/geo/services/TargetAreaService";
import type { TargetArea } from "@/shared/geo/types";

// Explicit return-type annotations below (rather than leaning on
// useMutation/useQuery's own inference) are load-bearing, not decoration:
// oxlint's type-aware checker resolves an unannotated exported function's
// inferred type fine WITHIN this file, but re-widens it to `any` for a
// consumer in a DIFFERENT file (observed on TargetAreaBanner.tsx's use of
// these hooks) -- annotating gives it a signature to read directly instead
// of re-deriving one through `useMutation`/`useQuery`'s own generics.
type ConfirmTargetAreaInput = { area: TargetArea; source: "gbp" | "gsc" };

function targetAreaQueryKey(projectId: string): readonly unknown[] {
  return ["target-area", projectId];
}

/**
 * The project's confirmed target area, its pending (unconfirmed) proposal, or
 * null -- shared by `TargetAreaBanner` and every affected tab's
 * `ScopeControl` under one cache entry, the same "one queryKey, many
 * independent callers" convention `useProjectDomain.ts`'s `useProject`
 * already uses for `["projects"]`.
 *
 * A plain `useQuery`, deliberately NOT `useMeteredQuery`:
 * `TargetAreaService.getTargetArea` reads only cached/free signals (cached
 * GBP, a first-party GSC call, D1 lookups -- see that service's own
 * no-metered-spend header), the same free-read class `useProjectMarket` and
 * `useAhrefsDomainRatings` already fetch without an authorization gate. There
 * is nothing here for a tab to "authorize" -- confirming or overriding the
 * area are the only writes, and those go through `useConfirmTargetArea` /
 * `useSetTargetArea` below.
 */
export function useTargetArea(
  projectId: string,
): UseQueryResult<TargetAreaResult> {
  return useQuery<TargetAreaResult>({
    queryKey: targetAreaQueryKey(projectId),
    queryFn: () => getTargetArea({ data: { projectId } }),
    staleTime: 60_000,
  });
}

/**
 * Accepts a detected proposal -- `TargetAreaBanner`'s "Use this for
 * research" action, and the ONLY caller of `confirmTargetArea` in the
 * client. Free (a D1 write, no metered provider -- see
 * TargetAreaService.ts's own header), so this needs no authorization gate,
 * unlike a metered mutation.
 */
export function useConfirmTargetArea(
  projectId: string,
): UseMutationResult<TargetArea, Error, ConfirmTargetAreaInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmTargetAreaInput) =>
      confirmTargetArea({ data: { projectId, ...input } }),
    onSuccess: () => {
      // Every mounted banner/scope control refetches, so accepting a
      // proposal in one tab hides the banner and updates the switcher
      // everywhere else too, without a full page reload.
      void queryClient.invalidateQueries({
        queryKey: targetAreaQueryKey(projectId),
      });
    },
  });
}

/**
 * Manual override from `GeoLocationSelect` -- confirmed immediately, per
 * TargetAreaService.setTargetArea's own doc comment. Shared by
 * `TargetAreaBanner`'s "Not right?" picker and every tab's `ScopeControl`:
 * both are "the picker" the design spec refers to as a single override path,
 * not two.
 */
export function useSetTargetArea(
  projectId: string,
): UseMutationResult<TargetArea, Error, TargetArea> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (area: TargetArea) =>
      setTargetArea({ data: { projectId, area } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: targetAreaQueryKey(projectId),
      });
    },
  });
}

/**
 * Reverts to "nothing confirmed" -- the only way back to that state once an
 * area has been accepted or manually set, since every other write
 * (`confirmTargetArea`/`setTargetArea`) only ever replaces one confirmed
 * area with another. `ScopeControl`'s own "Clear" affordance is the sole
 * caller: it only appears once something is actually confirmed (see that
 * component's own `hasConfirmedArea` gate), never for the plain country
 * fallback, where there is nothing to clear.
 */
export function useClearTargetArea(
  projectId: string,
): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearTargetArea({ data: { projectId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: targetAreaQueryKey(projectId),
      });
    },
  });
}
