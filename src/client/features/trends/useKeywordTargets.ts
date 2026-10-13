import { useCallback, useMemo, useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
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
import type { TargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import {
  parseStoredGeo,
  resolveRunGeo,
  toStoredMetricGeo,
} from "@/client/features/geo/resolveRunGeo";
import type { ResolvedGeo } from "@/shared/geo/types";
import { useTrendingOpportunities } from "./useTrendingOpportunities";
import { mergeKeywordRows, type KeywordTargetRow } from "./mergeKeywordRows";
import { canStartPaidRun } from "./canStartPaidRun";
import {
  pickDisplayGeo,
  resolveFailureReason,
  resolvePaidState,
  type PaidState,
  type RestoreOutcomeName,
} from "./keywordTargetsState";

/**
 * Merge free Search Console observations with explicitly requested ranking
 * research. Paid discovery is a mutation started only by runAgain controls;
 * opening, restoring, reconnecting or changing a project never authorizes it.
 *
 * The shared MutationCache prevents repeat clicks and survives a remount
 * while a request is pending. Awaiting history invalidation keeps that guard
 * active until the saved run is available. Capture the confirmed geography
 * with the request and label restored data with its recorded geography.
 */
/**
 * `useAutoRestoredRun`'s own cache key for this feature's "latest" restore
 * (mirrored, not imported -- the hook doesn't export it). Used only to
 * invalidate that one entry after a paid call settles; see the
 * `onSettled` comment below for why that invalidation is load-bearing, not
 * decoration.
 */
function latestRunQueryKey(projectId: string) {
  return ["analysisRun", "latest", projectId, RUN_FEATURES.keywordDiscovery];
}

/**
 * Scopes the mutation in TanStack Query's shared MutationCache, keyed so a
 * call started by one mount of this hook can still be SEEN (via
 * `useIsMutating`) by a later mount of the SAME hook for the SAME project --
 * see `paidCallInFlight`'s own comment below for why that visibility is
 * load-bearing, not incidental.
 */
function keywordDiscoveryMutationKey(projectId: string) {
  return ["keywordDiscovery", projectId];
}

type KeywordTargetsState = {
  rows: KeywordTargetRow[];
  geo: ResolvedGeo | null;
  fetchedAt: string | null;
  isLoadingFree: boolean;
  isRunningPaid: boolean;
  paidState: PaidState;
  /**
   * The recorded `reason` tag off a failed run (`insufficient_credits` |
   * `rate_limited` | `provider_error`; see keywordDiscovery.ts's
   * `describeFailure`), or null when we have no recorded failure to read one
   * from. Resolved by `resolveFailureReason`, NOT read straight off `active`
   * -- see that function's own comment in keywordTargetsState.ts for the
   * defect that distinction fixes: `active` (`fresh ?? restored`) is sticky
   * on an earlier success, so a failed "Refresh" re-run left `active` still
   * reading "ok" and this field silently null. `resolveFailureReason` falls
   * back to the restore's own result specifically for a live error, which by
   * then has, by construction, already been refreshed by that same attempt's
   * `onSettled` invalidation. Null means either nothing is failing, or a live
   * failure's own recording did not land in time -- either way, fall back to
   * the generic message rather than guessing a cause.
   */
  failureReason: string | null;
  gscUnavailable: boolean;
  runAgain: () => void;
  /** Re-reads the free analysis_runs history after `restoreLatestRun` itself
   *  errored (`paidState === "restore-failed"`). Free -- a stored row plus an
   *  R2 object the run already paid for -- and deliberately NOT `runAgain`:
   *  until this succeeds we do not know whether a paid run already exists,
   *  and spending to find out is the one thing this tab must never do. */
  retryRestore: () => void;
};

/**
 * The scope this hook captures a paid run under.
 *
 * Passed IN rather than resolved here (`useTargetAreaScope` used to be called
 * a second time, inside this hook). Two instances meant two independent
 * `area`/`ready` states over one shared query: the header `ScopeControl`
 * binds to the page's instance, so a scope change reached THIS one only after
 * `useSetTargetArea`'s mutation AND its invalidation refetch had both landed
 * -- two serverFn round trips, each on this app's 2.6-4.5s cold path (see
 * MEMORY's coldstart entry). "Change the scope, then click Refresh" is the
 * INTENDED flow for this tab, and it spent, and labeled, under the PREVIOUS
 * scope for the whole of that window. One instance, owned by the page, is
 * the only way that race cannot exist.
 */
type KeywordTargetsScope = Pick<TargetAreaScope, "area" | "ready">;

export function useKeywordTargets(
  projectId: string,
  hasCredits: boolean,
  targetAreaScope: KeywordTargetsScope,
): KeywordTargetsState {
  const free = useTrendingOpportunities(projectId);
  const domain = useProjectDomain(projectId);
  const market = useProjectMarket(projectId);
  const queryClient = useQueryClient();

  const restored = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.keywordDiscovery,
    schema: keywordDiscoveryResultSchema,
    enabled: true,
  });
  // Restore state describes stored evidence; it never authorizes spending.
  const outcome: RestoreOutcomeName | null = restored.outcome;

  const [fresh, setFresh] = useState<KeywordDiscoveryResult | null>(null);
  // The geo CAPTURED for `fresh` -- set ONLY inside `onSuccess`, from that
  // same call's own variables. See property 4 above.
  const [freshGeo, setFreshGeo] = useState<ResolvedGeo | null>(null);
  const discovery = useMutation({
    mutationKey: keywordDiscoveryMutationKey(projectId),
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
    onSuccess: (result, variables) => {
      // Set together, always, from THIS call's own variables -- never set
      // `freshGeo` any earlier (e.g. in `start()`, before the call
      // resolves). Setting it eagerly used to mean a FAILED re-run under a
      // NEW scope overwrote the label while the OLD (still-displayed, still
      // successful) rows stayed put underneath it -- see
      // `pickDisplayGeo`'s own comment.
      setFresh(result);
      setFreshGeo(variables.geo);
    },
    // Await the history refresh so the mutation remains pending until the
    // saved result is visible, including after the initiating card unmounts.
    // Refresh inactive observers too; dropping their cache would permit a
    // duplicate click before the durable history can be read.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: latestRunQueryKey(projectId),
        refetchType: "all",
      }),
    // No retry. A failed paid call may already have been billed (Labs can
    // charge for a task that subsequently errors) -- see
    // src/server/features/keywords/services/keywordDiscovery.ts.
    retry: 0,
  });

  // A mutation can outlive its component. Read the shared cache for the
  // spinner and read it synchronously again at click time below.
  const paidCallInFlight =
    useIsMutating({ mutationKey: keywordDiscoveryMutationKey(projectId) }) > 0;

  const start = useCallback(() => {
    // A rendered pending value can lag a second click. This cache lookup
    // runs synchronously for every explicit request and cannot be stale.
    if (
      !canStartPaidRun({
        hasDomain: domain != null,
        hasCredits,
        scopeReady: targetAreaScope.ready,
        restoreFailed: restored.isError,
        paidCallInFlight:
          queryClient.isMutating({
            mutationKey: keywordDiscoveryMutationKey(projectId),
          }) > 0,
      })
    ) {
      return;
    }
    const geo = resolveRunGeo(
      "keyword-volume",
      targetAreaScope.area,
      market.locationCode,
    );
    discovery.mutate({ geo, countryCode: market.locationCode });
  }, [
    discovery,
    domain,
    hasCredits,
    market.locationCode,
    projectId,
    queryClient,
    restored.isError,
    targetAreaScope.area,
    targetAreaScope.ready,
  ]);

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

  const paidState = resolvePaidState({
    domain,
    active,
    isError: discovery.isError,
    restoreFailed: restored.isError,
    outcome,
    hasCredits,
  });

  return {
    rows,
    geo: pickDisplayGeo({ active, fresh, freshGeo, restoredGeo }),
    fetchedAt: active?.status === "ok" ? active.fetchedAt : null,
    isLoadingFree: free.isLoading,
    // Reads the shared MutationCache across component remounts
    // (see `paidCallInFlight`'s own comment): `discovery.isPending` alone
    // would read false right after a mid-call remount even though a call
    // this same hook started earlier is still genuinely running.
    isRunningPaid: paidCallInFlight,
    paidState,
    failureReason: resolveFailureReason({
      active,
      isError: discovery.isError,
      restoredResult: restored.restored?.result ?? null,
    }),
    gscUnavailable: free.unavailable,
    runAgain: start,
    retryRestore: restored.retry,
  };
}
