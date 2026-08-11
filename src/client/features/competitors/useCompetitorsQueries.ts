import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  applyProjectCompetitorMutationSuccess,
  applyRemoveProjectCompetitorPatch,
  applySetProjectCompetitorPatch,
  competitorsListQueryKeyPrefix,
  projectCompetitorsQueryKey,
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

function reportProjectCompetitorError(error: unknown): void {
  toast.error(
    getStandardErrorMessage(error, "Couldn't update this competitor"),
  );
}

/**
 * Pins a competitor, or excludes (hides) it -- both free D1 writes. See
 * `applyProjectCompetitorMutationSuccess`'s own doc comment
 * (`competitorsCacheUpdaters.ts`) for what it writes into the cache, and why
 * a restored run gets no patch of its own.
 */
export function useSetProjectCompetitorMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { domain: string; status: "pinned" | "excluded" }) =>
      setProjectCompetitor({
        data: { projectId, domain: input.domain, status: input.status },
      }),
    onSuccess: (overrides, variables) => {
      applyProjectCompetitorMutationSuccess(
        queryClient,
        projectId,
        overrides,
        (page) => applySetProjectCompetitorPatch(page, variables),
      );
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
 * two need different LIVE-cache patches, so the caller says which this is
 * rather than the mutation guessing from what's in cache. See
 * `applyProjectCompetitorMutationSuccess`'s own doc comment for what it
 * writes into the cache.
 */
export function useRemoveProjectCompetitorMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { domain: string; reason: "unpin" | "unhide" }) =>
      removeProjectCompetitor({ data: { projectId, domain: input.domain } }),
    onSuccess: (overrides, variables) => {
      applyProjectCompetitorMutationSuccess(
        queryClient,
        projectId,
        overrides,
        (page) => applyRemoveProjectCompetitorPatch(page, variables),
      );
      toast.success(
        variables.reason === "unpin"
          ? `Unpinned ${variables.domain}`
          : `${variables.domain} is no longer hidden`,
      );
    },
    onError: reportProjectCompetitorError,
  });
}
