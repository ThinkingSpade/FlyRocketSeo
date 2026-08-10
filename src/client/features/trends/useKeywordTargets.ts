import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  pickDisplayGeo,
  resolvePaidState,
  type PaidState,
} from "./keywordTargetsState";

export type { PaidState };

/**
 * The Keyword Trends tab's keyword table: a free GSC half plus a once-only
 * paid Labs half (`getKeywordDiscovery`), merged into one list.
 *
 * Four properties matter more than anything else in this file -- each has
 * already caused a real defect (in this codebase, or in an earlier draft of
 * THIS file, caught on review), cited inline below where it's relevant:
 *
 * 1. The DURABLE "have we already spent on this project" guard is
 *    `restored.outcome`, an analysis_runs row read via `useAutoRestoredRun`.
 *    `attemptedRef` is only a within-mount latch that stops a second render
 *    of THIS SAME MOUNT firing before the first request resolves -- it
 *    resets on every navigation and must never be mistaken for the guard
 *    (see shouldAutoRunDiscovery.ts's own header). Because that D1 row, and
 *    this hook's own client-side cache of it, can each lag behind the
 *    actual paid call by several seconds, `paidCallInFlight` (below) adds a
 *    SECOND, complementary guard that survives an unmount mid-call, which
 *    `attemptedRef` and `restored.outcome` alone cannot.
 * 2. A restored run is labeled with the geography it was actually fetched
 *    under, read back via `parseStoredGeo`, never with whatever the live
 *    ScopeControl shows right now -- see resolveRunGeo.ts's own header for
 *    the mislabeling bug ("Defect 1") this exists to prevent. The same
 *    property governs the CAPTURE side too: the live scope control
 *    (`targetAreaScope.area`) isn't trustworthy to capture from until
 *    `targetAreaScope.ready` says so (see useTargetAreaScope.ts's own doc
 *    comment on `ready`) -- this project's one-shot paid call must never
 *    fire against a still-resolving default.
 * 3. The paid call is a MUTATION, not a query. A query can refetch on window
 *    focus, remount, or reconnect; that refetch is exactly the unbounded
 *    spend this whole "run once" design exists to rule out.
 * 4. `fresh` and `freshGeo` are set TOGETHER, only in `onSuccess`, from that
 *    SAME call's own mutation variables -- never eagerly in `start()`
 *    before the call resolves. See `pickDisplayGeo`'s own comment for the
 *    mislabeling bug that ordering used to cause.
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
  // The geo CAPTURED for `fresh` -- set ONLY inside `onSuccess`, from that
  // same call's own variables. See property 4 above.
  const [freshGeo, setFreshGeo] = useState<ResolvedGeo | null>(null);
  // Within-mount latch ONLY -- see property 1 above. Resets on every
  // navigation; the durable guard is `restored.outcome`, not this ref.
  const attemptedRef = useRef(false);

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
    // MUST `return` this promise, never `void` it -- this is the one
    // `invalidateQueries` call in this codebase where that distinction is
    // load-bearing, not style. query-core's `Mutation.execute` AWAITS
    // `onSettled` before dispatching the `"success"`/`"error"` action that
    // flips `status` out of "pending" (see mutation.js: onSuccess, then
    // onSettled, THEN `dispatch({type:"success"})`; the error path is the
    // same shape). `void`-ing the call here makes the awaited value
    // `undefined` immediately, so the dispatch -- and with it
    // `paidCallInFlight` dropping to false -- fires before the
    // invalidation's own refetch has actually landed. In that gap `outcome`
    // is STILL "none" (the query is mid-refetch, `useAutoRestoredRun.ts`
    // derives `outcome` from the OLD `query.data` until the new response
    // arrives) and `paidCallInFlight` has already gone false, so a
    // just-then remount sails straight through both of Critical 2's guards
    // and fires a second paid call -- the same double-spend the mutation
    // key was added to prevent, just delayed by the length of the first
    // call instead of eliminated. Returning the promise keeps the mutation
    // "pending" (and `paidCallInFlight` true) until this invalidation --
    // and, since a query observer is still active during that gap, its
    // triggered refetch -- has actually settled.
    //
    // This cannot wedge the mutation in "pending" forever if the REFETCH
    // itself fails: `invalidateQueries` -> `refetchQueries`
    // (queryClient.js) calls `query.fetch()` and, whenever
    // `options.throwOnError` isn't explicitly set (this app's QueryClient,
    // src/client/tanstack-db/queryClient.ts, never sets it), wraps that
    // fetch in `.catch(noop)` -- so a failed refetch resolves the returned
    // promise, it never rejects it. That matters because query-core's
    // SUCCESS path (unlike its error path) does not wrap its `onSettled`
    // await in a try/catch: a REJECTED onSettled after a successful paid
    // call would fall into the outer catch and flip a genuinely successful
    // run to `status: "error"`, corrupting `discovery.isError` for no
    // reason. Since the promise here is verified to never reject on a
    // refetch failure, that miscategorization can't happen. A refetch that
    // never settles at all (true network hang, not a failure) is a
    // different, pre-existing risk this doesn't newly introduce -- it's the
    // same class of risk the original `getKeywordDiscovery` call already
    // carries with no CLIENT-side timeout anywhere in this codebase. That
    // risk is bounded, not unlimited: this app runs on Cloudflare Workers,
    // whose requests carry their own platform-enforced timeout, so neither
    // this refetch nor the original call can hang forever. `runAgain` below
    // is now gated on `paidCallInFlight` (a reversal of an earlier version
    // of this comment -- see that guard's own comment for why), so a stuck
    // refetch also blocks a manual retry until Workers' own timeout clears
    // it, rather than offering the user a second, independently billed
    // attempt while the first is still technically alive.
    //
    // Runs on BOTH success and failure (unlike onSuccess): the service
    // records an analysis_runs row for a failed attempt too (see
    // "RECORD THE FAILURE, then rethrow" in
    // src/server/features/keywords/services/keywordDiscovery.ts), so the
    // D1 guard is already updated either way -- the client cache of it
    // must catch up either way too. Without this running on failure,
    // `useAutoRestoredRun`'s own query would still be serving the
    // fresh-but-pre-call "none" it cached before THIS call ran, for up to
    // its own 60s staleTime.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: latestRunQueryKey(projectId),
      }),
    // No retry. A failed paid call may already have been billed (Labs can
    // charge for a task that subsequently errors) -- see
    // src/server/features/keywords/services/keywordDiscovery.ts.
    retry: 0,
  });

  // Reads the shared MutationCache directly (via `useIsMutating`), NOT this
  // observer's own `discovery.isPending` -- so it stays true for a call an
  // EARLIER, now-unmounted instance of this hook started. TanStack Query
  // mutations outlive the observer/component that created them by design.
  // Without this, a component that unmounts mid paid-call and remounts gets
  // a fresh (false) `attemptedRef` AND a restore cache the in-flight call
  // hasn't had a chance to invalidate yet (`onSettled` above hasn't fired,
  // because the call hasn't finished) -- so `outcome` still reads "none",
  // which is exactly what `shouldAutoRunDiscovery` treats as safe, firing a
  // SECOND paid call before the first has even finished. The durable D1
  // guard cannot close this window on its own: the row doesn't exist until
  // the call settles.
  //
  // Also gates the MANUAL `runAgain` path below -- a reversal of this file's
  // earlier stance, which left `runAgain` deliberately ungated as an escape
  // hatch for a call that never settles. Traced through
  // `@tanstack/query-core`: `mutationKey` is lookup-only (`useIsMutating`,
  // `find`/`findAll`), never consulted by `mutate()`/`MutationCache.build()`,
  // which always constructs and executes a brand-new `Mutation` regardless
  // of what else currently shares its key. A double-click on "Refresh"/"Try
  // again"/"Refresh it" while a call is already in flight would therefore
  // fire a SECOND, independently billed Labs call -- a concrete, trivially
  // reachable double-spend, not a hypothetical one. That now outranks the
  // recovery path this guard used to preserve: this app runs on Cloudflare
  // Workers, whose requests carry their own platform-enforced timeout, so a
  // paid call cannot actually hang forever the way it could behind a
  // long-lived server. A hard reload (which clears the in-memory
  // MutationCache outright) is still available in the meantime, same as
  // before this change. See `start`'s own guard below.
  const paidCallInFlight =
    useIsMutating({ mutationKey: keywordDiscoveryMutationKey(projectId) }) > 0;

  const start = useCallback(() => {
    if (!domain) return;
    // Silent no-op while a call is already in flight -- see
    // `paidCallInFlight`'s own comment above for why this now applies to
    // every UI call site that invokes `runAgain` (header Refresh, the
    // failed banner's "Try again", the expired banner's "Refresh it"), not
    // just the automatic effect below. Guarding HERE, once, rather than in
    // each button's `onClick`, is what keeps every call site safe without
    // having to remember to repeat the check at each one. Silent rather
    // than surfacing an error: the card already renders an in-flight
    // indicator (`isRunningPaid`) and swaps each button's own label while
    // this is true, so a click that lands here was never going to tell the
    // user anything they can't already see.
    if (paidCallInFlight) return;
    const geo = resolveRunGeo(
      "keyword-volume",
      targetAreaScope.area,
      market.locationCode,
    );
    attemptedRef.current = true;
    discovery.mutate({ geo, countryCode: market.locationCode });
  }, [
    discovery,
    domain,
    market.locationCode,
    paidCallInFlight,
    targetAreaScope.area,
  ]);

  useEffect(() => {
    if (paidCallInFlight) return;
    // Property 2's capture side: `targetAreaScope.area` starts at the
    // country default and only reflects the project's actually-confirmed
    // area once `ready` says so (see useTargetAreaScope.ts's own doc
    // comment on `ready` for exactly which render that becomes true on).
    // Firing before then would spend this project's one-shot paid call
    // under the wrong geography -- permanently; there is no free re-fetch
    // to correct it with afterward. Deliberately NOT applied to the manual
    // `runAgain` path: a user clicking "Run again" is looking at the
    // CURRENT, already-rendered scope control and choosing to spend against
    // whatever it shows right now, ready or not.
    if (!targetAreaScope.ready) return;
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
  }, [
    domain,
    hasCredits,
    outcome,
    paidCallInFlight,
    start,
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
    outcome,
    hasCredits,
  });

  return {
    rows,
    geo: pickDisplayGeo(fresh, freshGeo, restoredGeo),
    fetchedAt: active?.status === "ok" ? active.fetchedAt : null,
    isLoadingFree: free.isLoading,
    // Reads the same MutationCache-backed signal the auto-run guard does
    // (see `paidCallInFlight`'s own comment): `discovery.isPending` alone
    // would read false right after a mid-call remount even though a call
    // this same hook started earlier is still genuinely running.
    isRunningPaid: paidCallInFlight,
    paidState,
    gscUnavailable: free.unavailable,
    runAgain: start,
  };
}
