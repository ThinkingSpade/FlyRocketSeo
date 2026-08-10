import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getCompetitorsList,
  getKeywordGapPage,
  getLinkGapPage,
  listProjectCompetitors,
  removeProjectCompetitor,
  setProjectCompetitor,
} from "@/serverFunctions/competitors";
import {
  competitorsPageSchema,
  type CompetitorsPage,
  type KeywordGapMode,
} from "@/types/schemas/competitors";
import {
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import { useHandoff } from "@/client/features/insights/handoffStore";
import {
  useProjectMarket,
  type ProjectMarket,
} from "@/client/hooks/useProjectDomain";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import {
  applyRemoveProjectCompetitorPatch,
  applySetProjectCompetitorPatch,
} from "./competitorsCacheUpdaters";
import { reapplyRestoredOverrides } from "./reapplyRestoredOverrides";

type CompetitorsRun = {
  authorized: boolean;
  runNonce: number;
  market: ProjectMarket;
  authorize: (keyOverride?: string) => void;
};

/**
 * Wraps `useAuthorizedRun` with this page's market-billing rule: the market
 * used for every metered competitor/gap call is captured into state at the
 * exact moment a run is authorized, instead of read live off
 * `useProjectMarket` on every render.
 *
 * `useProjectMarket` depends on the async `["projects"]` query and can
 * resolve to a new value *after* a run is already authorized. If the
 * metered queries read it live, that late arrival changes their query key
 * while they stay enabled, and TanStack Query treats a changed key on an
 * enabled query as a brand-new, never-fetched entry -- an uncommanded
 * second paid fetch for a run already paid for. Bundling the capture into
 * `authorize` itself -- rather than asking every call site to remember a
 * separate "capture the market" step -- means it happens for every run
 * (submit, run-again, analyze, refresh, compare-competitor) with no
 * dependency on render ordering: this is billing safety, not style.
 *
 * The initial `market` value is never actually read by a metered query --
 * every one of them stays disabled until `authorized` is true -- so it's
 * simply seeded from whatever the project market resolves to at mount.
 */
export function useCompetitorsRun(
  projectId: string,
  currentKey: string,
): CompetitorsRun {
  const run = useAuthorizedRun(currentKey);
  const projectMarket = useProjectMarket(projectId);
  const [market, setMarket] = useState<ProjectMarket>(projectMarket);

  return {
    authorized: run.authorized,
    runNonce: run.runNonce,
    market,
    authorize: (keyOverride) => {
      setMarket(projectMarket);
      run.authorize(keyOverride);
    },
  };
}

/**
 * Prefill the target input from a handoff, this tab's last run, or the
 * project's own domain -- but only while the field is still empty; never
 * clobber user input. `lastRun` comes from the caller's own `restored.label`
 * rather than `useLastRunInput`: the stored competitors result
 * (`competitorsPageSchema`) is just rows/count/fetchedAt, with no target
 * field of its own, so -- exactly like Keyword Research's seed keyword --
 * the target only exists as the analysis run's `label` column.
 *
 * Lives alongside this page's other supporting hooks rather than in
 * `CompetitorsPage` itself to keep that component under this file's
 * line-count limit.
 */
export function useCompetitorsTargetPrefill({
  projectId,
  target,
  targetInput,
  setTargetInput,
  projectDomain,
  lastRun,
}: {
  projectId: string;
  target: string;
  targetInput: string;
  setTargetInput: (value: string) => void;
  projectDomain: string | null;
  lastRun: string | null;
}) {
  const handoff = useHandoff(projectId);
  // There's no domain-shaped suggestion source, so this kind always passes an
  // empty suggestions list.
  const prefill = resolvePrefill({
    kind: "domain",
    searchParam: target,
    handoff,
    lastRun,
    suggestions: [],
    projectDefault: projectDomain,
  });

  useEffect(() => {
    if (!target && !targetInput && prefill.value) {
      setTargetInput(prefill.value);
    }
    // Only prefill while the field is empty; never clobber user input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill.value]);
}

/**
 * Shared prefix for every cached `competitors-list` page for a project, no
 * matter its target/page/market. `useCompetitorsQuery` below builds on top of
 * it, and `patchCachedCompetitorsPages` matches back against exactly this
 * prefix (TanStack Query's default `queryKey` matching is "starts with") so
 * the two can never drift apart.
 */
function competitorsListQueryKeyPrefix(projectId: string) {
  return ["competitors-list", projectId] as const;
}

export function useCompetitorsQuery(input: {
  projectId: string;
  target: string;
  page: number;
  pageSize: number;
  locationCode: number;
  languageCode: string;
  enabled: boolean;
  authorized: boolean;
  runNonce: number;
}) {
  const target = input.target.trim();
  return useMeteredQuery({
    authorized: input.authorized,
    runNonce: input.runNonce,
    enabled: input.enabled && target !== "",
    queryKey: [
      ...competitorsListQueryKeyPrefix(input.projectId),
      target,
      input.page,
      input.pageSize,
      input.locationCode,
      input.languageCode,
    ],
    queryFn: () =>
      getCompetitorsList({
        data: {
          projectId: input.projectId,
          target,
          page: input.page,
          pageSize: input.pageSize,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
        },
      }),
  });
}

export function useKeywordGapQuery(input: {
  projectId: string;
  target: string;
  competitor: string;
  mode: KeywordGapMode;
  page: number;
  pageSize: number;
  locationCode: number;
  languageCode: string;
  enabled: boolean;
  authorized: boolean;
  runNonce: number;
}) {
  const target = input.target.trim();
  const competitor = input.competitor.trim();
  return useMeteredQuery({
    authorized: input.authorized,
    runNonce: input.runNonce,
    enabled: input.enabled && target !== "" && competitor !== "",
    queryKey: [
      "keyword-gap",
      input.projectId,
      target,
      competitor,
      input.mode,
      input.page,
      input.pageSize,
      input.locationCode,
      input.languageCode,
    ],
    queryFn: () =>
      getKeywordGapPage({
        data: {
          projectId: input.projectId,
          target,
          competitor,
          mode: input.mode,
          page: input.page,
          pageSize: input.pageSize,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
        },
      }),
  });
}

export function useLinkGapQuery(input: {
  projectId: string;
  target: string;
  competitor: string;
  page: number;
  pageSize: number;
  enabled: boolean;
  authorized: boolean;
  runNonce: number;
}) {
  const target = input.target.trim();
  const competitor = input.competitor.trim();
  return useMeteredQuery({
    authorized: input.authorized,
    runNonce: input.runNonce,
    enabled: input.enabled && target !== "" && competitor !== "",
    queryKey: [
      "link-gap",
      input.projectId,
      target,
      competitor,
      input.page,
      input.pageSize,
    ],
    queryFn: () =>
      getLinkGapPage({
        data: {
          projectId: input.projectId,
          target,
          competitor,
          page: input.page,
          pageSize: input.pageSize,
        },
      }),
  });
}

/** Query key for this project's pin/exclude overrides -- a free D1 read, so
 *  unlike the hooks above this is a plain `useQuery`, never `useMeteredQuery`. */
function projectCompetitorsQueryKey(projectId: string) {
  return ["project-competitors", projectId] as const;
}

/**
 * This project's standing pin/exclude overrides. Free (one D1 read, no
 * DataForSEO call), so it needs no `authorized` gate. Mounted both on demand
 * by the hidden-domains manager, and unconditionally by
 * `useRestoredCompetitorsRun` below -- TanStack Query dedupes by query key,
 * so the second mount is a cache hit whenever the first already ran, not a
 * second request.
 */
export function useProjectCompetitorsQuery(projectId: string) {
  return useQuery({
    queryKey: projectCompetitorsQueryKey(projectId),
    queryFn: () => listProjectCompetitors({ data: { projectId } }),
  });
}

/**
 * The restored run for a tab, with this project's CURRENT pin/exclude
 * overrides re-applied -- a thin wrapper around `useAutoRestoredRun` so
 * `CompetitorsPage` doesn't have to. `useAutoRestoredRun`'s own result is a
 * byte-for-byte snapshot taken when the run was recorded, and nothing ever
 * rewrites it; the overrides read here is what makes a standing exclusion or
 * pin survive a reload instead of only lasting the rest of the session (see
 * `reapplyRestoredOverrides`'s own doc comment for the full reasoning).
 */
export function useRestoredCompetitorsRun(input: {
  projectId: string;
  enabled: boolean;
  runId: string | null;
}) {
  const { restored, outcome, expired } = useAutoRestoredRun({
    projectId: input.projectId,
    feature: RUN_FEATURES.competitors,
    schema: competitorsPageSchema,
    enabled: input.enabled,
    runId: input.runId,
  });
  const overrides = useProjectCompetitorsQuery(input.projectId);
  return {
    restored: reapplyRestoredOverrides(restored, overrides.data ?? []),
    outcome,
    expired,
  };
}

/**
 * Rewrites every cached `competitors-list` page for this project in place,
 * rather than invalidating them.
 *
 * `competitors-list` is a metered (`useMeteredQuery`) key, and pin/exclude
 * are free D1 writes that must never cause a paid DataForSEO refetch. Calling
 * `queryClient.invalidateQueries` here would risk exactly that: verified
 * against the installed `@tanstack/query-core`, its default `refetchType:
 * "active"` refetches any matching query whose observer has `enabled !==
 * false` (`Query.isActive`) -- which describes a live, already-authorized
 * competitors run sitting on screen, the normal moment a user clicks Pin.
 * `setQueriesData` only ever writes the cache and touches the network not at
 * all, so it keeps "no automatic spend" true even then. The `{ queryKey:
 * competitorsListQueryKeyPrefix(projectId) }` filter partial-matches every
 * cached page for this project regardless of its target/page/market suffix.
 */
function patchCachedCompetitorsPages(
  queryClient: QueryClient,
  projectId: string,
  updater: (page: CompetitorsPage) => CompetitorsPage,
): void {
  queryClient.setQueriesData<CompetitorsPage>(
    { queryKey: competitorsListQueryKeyPrefix(projectId) },
    (page) => (page ? updater(page) : page),
  );
}

/**
 * Query key `useAutoRestoredRun` builds for this project's restored
 * competitors run when no specific past run is selected -- the common case
 * since Task 8 made restore-on-open the default rather than forcing an
 * Analyze click, which is exactly when a live `competitors-list` entry
 * (what `patchCachedCompetitorsPages` above patches) does NOT exist yet.
 * Duplicated from `useAutoRestoredRun.ts`'s own `["analysisRun", runId ??
 * "latest", projectId, feature]`, since that hook is feature-agnostic and
 * exports no key-builder. A future drift between the two degrades safely,
 * not silently wrong: `setQueryData` below would simply match nothing, and
 * the mutation's own (already-successful) D1 write remains the only
 * effect -- the row/hiddenCount just would not update until the next
 * reload, same as before this function existed.
 *
 * Deliberately does NOT cover a specific past run opened from
 * `RecentRunsList` (`runId` set to something other than the latest): that
 * is a deliberate "look at history" action, not the default view, and
 * reaching it here would need the page's own `selectedRunId` state threaded
 * all the way down through `CompetitorsTable` into this hook.
 */
function restoredCompetitorsRunQueryKey(projectId: string) {
  return [
    "analysisRun",
    "latest",
    projectId,
    RUN_FEATURES.competitors,
  ] as const;
}

/** The slice of `useAutoRestoredRun`'s raw cached shape this patch needs --
 *  structurally typed rather than imported, since that hook keeps its
 *  outcome type private. */
type RestoredRunCacheEntry = {
  status: string;
  run?: { resultJson: string };
};

function patchCachedRestoredCompetitorsRun(
  queryClient: QueryClient,
  projectId: string,
  updater: (page: CompetitorsPage) => CompetitorsPage,
): void {
  queryClient.setQueryData<RestoredRunCacheEntry>(
    restoredCompetitorsRunQueryKey(projectId),
    (entry) => {
      if (!entry || entry.status !== "ready" || !entry.run) return entry;
      let parsed: unknown;
      try {
        parsed = JSON.parse(entry.run.resultJson);
      } catch {
        return entry;
      }
      const result = competitorsPageSchema.safeParse(parsed);
      if (!result.success) return entry;
      return {
        ...entry,
        run: { ...entry.run, resultJson: JSON.stringify(updater(result.data)) },
      };
    },
  );
}

function reportProjectCompetitorError(error: unknown): void {
  toast.error(
    getStandardErrorMessage(error, "Couldn't update this competitor"),
  );
}

/**
 * Pins a competitor, or excludes (hides) it -- both free D1 writes. See
 * `patchCachedCompetitorsPages` for why the competitors-list cache is
 * patched directly instead of invalidated, and
 * `patchCachedRestoredCompetitorsRun` for why a restored view needs the
 * same patch applied a second time, to a differently-shaped cache entry.
 */
export function useSetProjectCompetitorMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { domain: string; status: "pinned" | "excluded" }) =>
      setProjectCompetitor({
        data: { projectId, domain: input.domain, status: input.status },
      }),
    onSuccess: (overrides, variables) => {
      queryClient.setQueryData(
        projectCompetitorsQueryKey(projectId),
        overrides,
      );
      const updater = (page: CompetitorsPage) =>
        applySetProjectCompetitorPatch(page, variables);
      patchCachedCompetitorsPages(queryClient, projectId, updater);
      patchCachedRestoredCompetitorsRun(queryClient, projectId, updater);
      toast.success(
        variables.status === "pinned"
          ? `Pinned ${variables.domain}`
          : `Excluded ${variables.domain}`,
      );
    },
    onError: reportProjectCompetitorError,
  });
}

/**
 * Clears a standing override -- unpinning a visible row, or unhiding an
 * excluded one from the hidden-domains manager. Both go through the same
 * `removeProjectCompetitor` call (it just deletes the override row), but the
 * two need different cache patches, so the caller says which this is rather
 * than the mutation guessing from what's in cache.
 */
export function useRemoveProjectCompetitorMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { domain: string; reason: "unpin" | "unhide" }) =>
      removeProjectCompetitor({ data: { projectId, domain: input.domain } }),
    onSuccess: (overrides, variables) => {
      queryClient.setQueryData(
        projectCompetitorsQueryKey(projectId),
        overrides,
      );
      const updater = (page: CompetitorsPage) =>
        applyRemoveProjectCompetitorPatch(page, variables);
      patchCachedCompetitorsPages(queryClient, projectId, updater);
      patchCachedRestoredCompetitorsRun(queryClient, projectId, updater);
      toast.success(
        variables.reason === "unpin"
          ? `Unpinned ${variables.domain}`
          : `${variables.domain} is no longer hidden`,
      );
    },
    onError: reportProjectCompetitorError,
  });
}
