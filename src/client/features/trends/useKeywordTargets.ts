import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getKeywordDiscovery } from "@/serverFunctions/keywordDiscovery";
import {
  keywordDiscoveryGeoBundleSchema,
  keywordDiscoveryResultSchema,
  type KeywordDiscoveryResult,
} from "@/types/schemas/keyword-discovery";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import {
  useProjectDomain,
  useProjectMarket,
} from "@/client/hooks/useProjectDomain";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import {
  parseStoredGeo,
  resolveRunGeo,
  toStoredMetricGeo,
} from "@/client/features/geo/resolveRunGeo";
import type { ResolvedGeo } from "@/shared/geo/types";
import { useTrendingOpportunities } from "./useTrendingOpportunities";
import { mergeKeywordRows, type KeywordTargetRow } from "./mergeKeywordRows";
import {
  shouldAutoRunDiscovery,
  type RestoreOutcomeName,
} from "./shouldAutoRunDiscovery";

/**
 * The Keyword Trends tab's keyword table: a free GSC half plus a once-only
 * paid Labs half (`getKeywordDiscovery`), merged into one list.
 *
 * Three properties matter more than anything else in this file -- each has
 * already caused a real defect elsewhere in this codebase, cited inline
 * below where it's relevant:
 *
 * 1. The DURABLE "have we already spent on this project" guard is
 *    `restored.outcome`, an analysis_runs row read via `useAutoRestoredRun`.
 *    `attemptedRef` is only a within-mount latch that stops a second render
 *    of THIS SAME MOUNT firing before the first request resolves -- it
 *    resets on every navigation and must never be mistaken for the guard
 *    (see shouldAutoRunDiscovery.ts's own header).
 * 2. A restored run is labeled with the geography it was actually fetched
 *    under, read back via `parseStoredGeo`, never with whatever the live
 *    ScopeControl shows right now -- see resolveRunGeo.ts's own header for
 *    the mislabeling bug ("Defect 1") this exists to prevent.
 * 3. The paid call is a MUTATION, not a query. A query can refetch on window
 *    focus, remount, or reconnect; that refetch is exactly the unbounded
 *    spend this whole "run once" design exists to rule out.
 */

export type PaidState =
  | "ok"
  | "none"
  | "failed"
  | "expired"
  | "no-domain"
  | "no-credits";

export type KeywordTargetsState = {
  rows: KeywordTargetRow[];
  geo: ResolvedGeo | null;
  fetchedAt: string | null;
  isLoadingFree: boolean;
  isRunningPaid: boolean;
  paidState: PaidState;
  gscUnavailable: boolean;
  runAgain: () => void;
};

/**
 * `useAutoRestoredRun`'s own cache key for this feature's "latest" restore
 * (mirrored, not imported -- the hook doesn't export it). Used only to
 * invalidate that one entry after a successful paid run; see the
 * `onSuccess` comment below for why that invalidation is load-bearing, not
 * decoration.
 */
function latestRunQueryKey(projectId: string) {
  return ["analysisRun", "latest", projectId, RUN_FEATURES.keywordDiscovery];
}

export function useKeywordTargets(
  projectId: string,
  hasCredits: boolean,
): KeywordTargetsState {
  const free = useTrendingOpportunities(projectId);
  const domain = useProjectDomain(projectId);
  const market = useProjectMarket(projectId);
  const targetAreaScope = useTargetAreaScope(projectId, market.locationCode);
  const queryClient = useQueryClient();

  const restored = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.keywordDiscovery,
    schema: keywordDiscoveryResultSchema,
    enabled: true,
  });
  // Named via `shouldAutoRunDiscovery`'s own produced type rather than left
  // as an inline literal union, so the guard's contract (Task 3) and this
  // hook's use of it can't silently drift apart.
  const outcome: RestoreOutcomeName | null = restored.outcome;

  const [fresh, setFresh] = useState<KeywordDiscoveryResult | null>(null);
  // The geo CAPTURED for `fresh` -- set in the same breath as the mutate()
  // call, never recomputed from the live scope afterward. See property 2
  // above.
  const [freshGeo, setFreshGeo] = useState<ResolvedGeo | null>(null);
  // Within-mount latch ONLY -- see property 1 above. Resets on every
  // navigation; the durable guard is `restored.outcome`, not this ref.
  const attemptedRef = useRef(false);

  const discovery = useMutation({
    mutationFn: (input: { geo: ResolvedGeo; countryCode: number }) =>
      getKeywordDiscovery({
        data: {
          projectId,
          domain: domain ?? "",
          locationCode: input.geo.locationCode,
          languageCode: input.geo.languageCode,
          geo: toStoredMetricGeo(input.geo, input.countryCode),
        },
      }),
    onSuccess: (result) => {
      setFresh(result);
      // The analysis_runs row this call just wrote is what makes
      // `restored.outcome` stop being "none" -- but `useAutoRestoredRun`'s
      // own query can still be sitting on whatever it cached BEFORE this
      // call ran (its staleTime is 60s). Without invalidating it, a quick
      // navigate-away-and-back remounts this hook with a fresh (false)
      // `attemptedRef` *and* a stale "none" outcome -- exactly the
      // combination `shouldAutoRunDiscovery` treats as safe to run, firing a
      // second paid call. This closes that window.
      void queryClient.invalidateQueries({
        queryKey: latestRunQueryKey(projectId),
      });
    },
    // No retry. A failed paid call may already have been billed (Labs can
    // charge for a task that subsequently errors) -- see
    // src/server/features/keywords/services/keywordDiscovery.ts.
    retry: 0,
  });

  const start = useCallback(() => {
    if (!domain) return;
    const geo = resolveRunGeo(
      "keyword-volume",
      targetAreaScope.area,
      market.locationCode,
    );
    attemptedRef.current = true;
    setFreshGeo(geo);
    discovery.mutate({ geo, countryCode: market.locationCode });
  }, [discovery, domain, market.locationCode, targetAreaScope.area]);

  useEffect(() => {
    if (
      !shouldAutoRunDiscovery({
        outcome,
        hasDomain: domain != null,
        hasCredits,
        alreadyAttempted: attemptedRef.current,
      })
    ) {
      return;
    }
    start();
  }, [domain, hasCredits, outcome, start]);

  // A live `fresh` result always wins over a restored one: it is this
  // mount's own, just-completed call, more current than anything
  // `useAutoRestoredRun`'s cache can know about (see the invalidation
  // comment above for why that cache can lag).
  const active = fresh ?? restored.restored?.result ?? null;

  // Property 2: label a restored run with ITS OWN persisted geography.
  // `bundle.rankings` is a `StoredMetricGeo` -- a strict superset of
  // `ResolvedGeo` (it carries one extra field, `parentCountryCode`) -- so it
  // is read directly rather than run back through `resolveStoredGeo`.
  // Reconstructing from `stored.locationCode`/`stored.languageCode` alone
  // would repeat the exact mistake resolveRunGeo.ts's header warns about:
  // `resolveStoredGeo` cannot tell a metro/DMA code from a country code
  // apart, and keyword-volume is a need that CAN go local. `parseStoredGeo`
  // returning null means a run recorded before this bundle existed, or a
  // corrupt one -- "geography unknown for this run", never a guess.
  const restoredGeo = useMemo(() => {
    const bundle = parseStoredGeo(
      keywordDiscoveryGeoBundleSchema,
      restored.restored?.params,
    );
    return bundle ? bundle.rankings : null;
  }, [restored.restored?.params]);

  const rows = useMemo(
    () =>
      mergeKeywordRows({
        gsc: free.opportunities,
        labs: active?.status === "ok" ? active.keywords : [],
      }),
    [active, free.opportunities],
  );

  // Ordered most-specific-fact-first, not "running" first: `isRunningPaid`
  // already carries in-flight state as its own field, so a mutation that's
  // merely re-fetching (e.g. a "Run again" click) doesn't blank out the
  // still-valid `paidState` describing what we last actually got.
  const paidState: PaidState =
    domain == null
      ? "no-domain"
      : active?.status === "ok"
        ? "ok"
        : discovery.isError || active?.status === "failed"
          ? "failed"
          : outcome === "expired" || outcome === "unreadable"
            ? "expired"
            : !hasCredits
              ? "no-credits"
              : "none";

  return {
    rows,
    geo: fresh ? freshGeo : restoredGeo,
    fetchedAt: active?.status === "ok" ? active.fetchedAt : null,
    isLoadingFree: free.isLoading,
    isRunningPaid: discovery.isPending,
    paidState,
    gscUnavailable: free.unavailable,
    runAgain: start,
  };
}
