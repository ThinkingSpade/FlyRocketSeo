import { useCallback, useEffect, useMemo, useState } from "react";
import { writeHandoff } from "@/client/features/insights/handoffStore";
import type {
  BacklinksSearchTabInput,
  SearchTabInput,
} from "@/client/features/search-tabs/types";
import { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";
import type {
  BacklinksNavigate,
  BacklinksOverviewData,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import { buildBacklinksAuthorizationKey } from "./backlinksAuthorizationKey";
import {
  advanceBacklinksRestoredRefresh,
  hasBacklinksTarget,
  resolveBacklinksRestoredResults,
  type BacklinksRestoredRefreshPhase,
} from "./backlinksRestoredState";
import { navigateToBacklinksSearch } from "./useBacklinksPageData";

type StoredBacklinksRun = {
  result: { overview: BacklinksOverviewData };
  label: string;
  lastRanAt: string;
  runCount: number;
};

type RestoredRunSnapshot = {
  overview: BacklinksOverviewData;
  label: string;
  lastRanAt: string;
  runCount: number;
};

type BacklinksRestoredRefresh = RestoredRunSnapshot & {
  projectId: string;
  target: string;
  scope: BacklinksSearchState["scope"];
  phase: Exclude<BacklinksRestoredRefreshPhase, "idle">;
  expectedRunNonce: number;
  hasNavigated: boolean;
};

function toBacklinksTabInput(
  values: Pick<BacklinksSearchState, "target" | "scope">,
): BacklinksSearchTabInput {
  return {
    type: "backlinks",
    target: values.target,
    scope: values.scope,
  };
}

export function useBacklinksSearchFlow({
  projectId,
  searchState,
  hasTarget,
  navigate,
  run,
  rowsQuery,
  restoredRun,
  addSearch,
}: {
  projectId: string;
  searchState: BacklinksSearchState;
  hasTarget: boolean;
  navigate: BacklinksNavigate;
  run: {
    runNonce: number;
    authorize: (keyOverride?: string) => void;
  };
  rowsQuery: { isSuccess: boolean; isError: boolean };
  restoredRun: StoredBacklinksRun | null;
  addSearch: (values: Pick<BacklinksSearchState, "target" | "scope">) => void;
}) {
  const [restoredRefresh, setRestoredRefresh] =
    useState<BacklinksRestoredRefresh | null>(null);
  const urlTabInput = useMemo<SearchTabInput | null>(() => {
    if (!hasTarget) return null;
    return toBacklinksTabInput({
      target: searchState.target,
      scope: searchState.scope,
    });
  }, [hasTarget, searchState.scope, searchState.target]);
  const navigateToTab = useCallback(
    (input: SearchTabInput | null) => {
      if (input?.type !== "backlinks") {
        navigate({ search: () => ({}), replace: true });
        return;
      }
      navigateToBacklinksSearch(navigate, input);
    },
    [navigate],
  );
  const searchTabs = useSearchTabNavigation({
    storageKey: `backlinks:${projectId}`,
    urlInput: urlTabInput,
    getLabel: useCallback(
      (input) => (input.type === "backlinks" ? input.target : ""),
      [],
    ),
    navigateToInput: navigateToTab,
  });
  const { authorize, runNonce } = run;
  const { canOpenTab, openTab } = searchTabs;

  const runBacklinksSearch = useCallback(
    (
      values: Pick<BacklinksSearchState, "target" | "scope">,
      restoredSnapshot?: RestoredRunSnapshot,
    ): boolean => {
      const normalizedValues = { ...values, target: values.target.trim() };
      if (!hasBacklinksTarget(normalizedValues.target)) return false;

      const tabInput = toBacklinksTabInput(normalizedValues);
      if (!canOpenTab(tabInput)) return false;
      const openedTab = openTab(tabInput);
      if (openedTab.dropped) return false;

      writeHandoff(projectId, {
        kind: "domain",
        value: normalizedValues.target,
        source: "Backlinks",
        at: Date.now(),
      });

      const sameSearch =
        normalizedValues.target === searchState.target &&
        normalizedValues.scope === searchState.scope;
      const ownedRestoredRefresh =
        !restoredSnapshot &&
        sameSearch &&
        restoredRefresh?.projectId === projectId &&
        restoredRefresh.target === normalizedValues.target &&
        restoredRefresh.scope === normalizedValues.scope &&
        restoredRefresh.phase !== "succeeded"
          ? restoredRefresh
          : undefined;
      const effectiveRestoredSnapshot =
        restoredSnapshot ?? ownedRestoredRefresh;
      if (!effectiveRestoredSnapshot && sameSearch) {
        setRestoredRefresh(null);
        authorize();
        return true;
      }

      const nextSearchState: BacklinksSearchState = {
        ...searchState,
        target: normalizedValues.target,
        scope: normalizedValues.scope,
        tab: "backlinks",
        page: 1,
        sort: undefined,
        order: undefined,
        view: effectiveRestoredSnapshot ? "all" : searchState.view,
      };
      if (effectiveRestoredSnapshot) {
        setRestoredRefresh({
          ...effectiveRestoredSnapshot,
          projectId,
          target: normalizedValues.target,
          scope: normalizedValues.scope,
          phase: "loading",
          expectedRunNonce: runNonce + 1,
          hasNavigated: sameSearch,
        });
      } else {
        setRestoredRefresh(null);
      }

      authorize(buildBacklinksAuthorizationKey(projectId, nextSearchState));
      navigateToBacklinksSearch(navigate, normalizedValues, {
        view: effectiveRestoredSnapshot ? "all" : undefined,
      });
      if (!sameSearch) addSearch(normalizedValues);
      return true;
    },
    [
      addSearch,
      authorize,
      canOpenTab,
      navigate,
      openTab,
      projectId,
      restoredRefresh,
      runNonce,
      searchState,
    ],
  );

  useEffect(() => {
    setRestoredRefresh((current) => {
      if (!current || current.projectId !== projectId) return null;
      const ownsTarget =
        hasTarget &&
        searchState.target.trim() === current.target &&
        searchState.scope === current.scope;
      if (!ownsTarget) {
        return current.hasNavigated || hasTarget ? null : current;
      }

      const phase = advanceBacklinksRestoredRefresh({
        phase: current.phase,
        expectedRunNonce: current.expectedRunNonce,
        currentRunNonce: runNonce,
        rowsSucceeded: rowsQuery.isSuccess,
        rowsFailed: rowsQuery.isError,
      });
      if (current.hasNavigated && phase === current.phase) return current;
      return { ...current, hasNavigated: true, phase };
    });
  }, [
    hasTarget,
    projectId,
    rowsQuery.isError,
    rowsQuery.isSuccess,
    runNonce,
    searchState.scope,
    searchState.target,
  ]);

  const activeRestoredRefresh = useMemo(() => {
    if (!restoredRefresh || restoredRefresh.projectId !== projectId)
      return null;
    const ownsTarget =
      hasTarget &&
      searchState.target.trim() === restoredRefresh.target &&
      searchState.scope === restoredRefresh.scope;
    if (ownsTarget || (!hasTarget && !restoredRefresh.hasNavigated)) {
      return restoredRefresh;
    }
    return null;
  }, [
    hasTarget,
    projectId,
    restoredRefresh,
    searchState.scope,
    searchState.target,
  ]);
  const restoredSnapshot = useMemo<RestoredRunSnapshot | null>(
    () =>
      restoredRun
        ? {
            overview: restoredRun.result.overview,
            label: restoredRun.label,
            lastRanAt: restoredRun.lastRanAt,
            runCount: restoredRun.runCount,
          }
        : null,
    [restoredRun],
  );
  const activeRestoredSnapshot = activeRestoredRefresh ?? restoredSnapshot;
  const restoredResults = activeRestoredSnapshot
    ? resolveBacklinksRestoredResults({
        phase: activeRestoredRefresh?.phase ?? "idle",
        storedTarget: activeRestoredSnapshot.overview.target,
        canOpenTab:
          hasBacklinksTarget(activeRestoredSnapshot.overview.target) &&
          canOpenTab(
            toBacklinksTabInput({
              target: activeRestoredSnapshot.overview.target.trim(),
              scope: activeRestoredSnapshot.overview.scope,
            }),
          ),
      })
    : null;
  const refreshRestoredLinks = useCallback(() => {
    if (!activeRestoredSnapshot) return;
    runBacklinksSearch(
      {
        target: activeRestoredSnapshot.overview.target,
        scope: activeRestoredSnapshot.overview.scope,
      },
      activeRestoredSnapshot,
    );
  }, [activeRestoredSnapshot, runBacklinksSearch]);
  const canOpenSearch = useCallback(
    (values: Pick<BacklinksSearchState, "target" | "scope">) =>
      canOpenTab(toBacklinksTabInput(values)),
    [canOpenTab],
  );

  return {
    canOpenSearch,
    refreshRestoredLinks,
    restoredRefresh: activeRestoredRefresh,
    restoredResults,
    runBacklinksSearch,
    searchTabs,
  };
}
