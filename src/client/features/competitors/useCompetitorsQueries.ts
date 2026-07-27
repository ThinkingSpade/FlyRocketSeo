import { useEffect, useRef } from "react";
import {
  getCompetitorsList,
  getKeywordGapPage,
  getLinkGapPage,
} from "@/serverFunctions/competitors";
import type { KeywordGapMode } from "@/types/schemas/competitors";
import { useMeteredQuery } from "@/client/lib/useMeteredQuery";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import { useHandoff } from "@/client/features/insights/handoffStore";
import type { ProjectMarket } from "@/client/hooks/useProjectDomain";

/**
 * The market to bill this page's metered competitor/gap calls against.
 *
 * `market` (from `useProjectMarket`) can update after a run is already
 * authorized -- `["projects"]` is an async query, and authorization is keyed
 * on target/competitor/tab/mode/page only, never on location, so a late
 * arrival does not deauthorize anything. But `locationCode`/`languageCode`
 * still feed the metered query's key below, and changing a query key while it
 * stays enabled makes TanStack Query treat it as a brand-new, never-fetched
 * entry and fetch it immediately -- a second metered call the user never
 * asked for. Freezing the market the moment a run becomes authorized (and
 * tracking it live otherwise, so a late arrival still lands before the user
 * actually submits) keeps the key stable for the lifetime of that run.
 */
export function useAuthorizedMarket(
  market: ProjectMarket,
  authorized: boolean,
): ProjectMarket {
  const frozen = useRef(market);
  if (!authorized) frozen.current = market;
  return authorized ? frozen.current : market;
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
      "competitors-list",
      input.projectId,
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
