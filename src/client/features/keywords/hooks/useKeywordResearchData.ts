import { useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { LOCATIONS, getLanguageCode } from "@/client/features/keywords/utils";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import { researchKeywords } from "@/serverFunctions/keywords";
import {
  keywordResearchResultSchema,
  type keywordResearchGeoBundleSchema,
} from "@/types/schemas/keywords";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import type {
  KeywordMode,
  ResearchSource,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import { useMeteredQuery } from "@/client/lib/useMeteredQuery";
import { restoredRunAnswers } from "@/client/features/keywords/state/keywordSessionRuns";

type AddSearchFn = (
  keyword: string,
  locationCode: number,
  locationName: string,
) => void;

type KeywordResearchQueryInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

/** Defect 1 fix: the CAPTURED geo bundle from authorize()-time
 *  (useKeywordResearchController.ts's own `KeywordResearchGeo`, converted
 *  to its wire shape). Opaque to this module -- forwarded verbatim so the
 *  server can persist it, never inspected here. */
type KeywordResearchGeoBundle = z.infer<typeof keywordResearchGeoBundleSchema>;

type KeywordResearchRequest = {
  projectId: string;
  keywords: string[];
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
  geo?: KeywordResearchGeoBundle;
};

export const KEYWORD_RESEARCH_STALE_TIME_MS = 24 * 60 * 60 * 1000;

/**
 * `languageCodeOverride` is Task 6's geo threading: when `input.locationCode`
 * is a resolved metro/DMA code (see `resolveRunGeo`), the bare
 * `getLanguageCode(input.locationCode)` fallback below would miss (that
 * table is keyed by country code only) and silently default to "en" --
 * correct today by coincidence (every seeded metro is US), wrong the moment
 * a non-English country gets metro rows. Passing the geo's OWN resolved
 * language sidesteps that instead of relying on the coincidence.
 *
 * `geo` is Defect 1's fix: the bundle captured alongside `languageCodeOverride`
 * at the exact same authorize()-time snapshot, sent purely so the server can
 * persist it for a later restore.
 */
export function buildKeywordResearchRequest(
  input: KeywordResearchQueryInput,
  languageCodeOverride?: string,
  geo?: KeywordResearchGeoBundle,
): KeywordResearchRequest | null {
  const keywords = parseKeywordInput(input.keywordInput);
  const seedKeyword = keywords[0] ?? "";
  if (!seedKeyword) return null;

  return {
    projectId: input.projectId,
    keywords,
    seedKeyword,
    locationCode: input.locationCode,
    languageCode: languageCodeOverride ?? getLanguageCode(input.locationCode),
    resultLimit: input.resultLimit,
    mode: input.mode,
    clickstream: input.clickstream,
    geo,
  };
}

export function buildKeywordResearchQueryKey(
  request: KeywordResearchRequest | null,
) {
  return request
    ? [
        "keywordResearch",
        request.projectId,
        request.keywords,
        request.locationCode,
        request.languageCode,
        request.resultLimit,
        request.mode,
        request.clickstream,
      ]
    : ["keywordResearch", "idle"];
}

export function keywordResearchQueryFn(request: KeywordResearchRequest) {
  return researchKeywords({
    data: {
      projectId: request.projectId,
      keywords: request.keywords,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
      resultLimit: request.resultLimit,
      mode: request.mode,
      clickstream: request.clickstream,
      geo: request.geo,
    },
  });
}

/** Everything captured alongside `authorizedInput` at the SAME
 *  authorize()-time snapshot (see useKeywordResearchController.ts) --
 *  bundled into one parameter so this function's own signature stays
 *  under the project's max-params budget as Defect 1 added a second
 *  captured value alongside the pre-existing language override. */
type AuthorizedCapture = {
  // Already `authorizedInput`'s own `locationCode` may be a resolved metro
  // code by the time it reaches here, so this must come from the same
  // capture rather than being re-derived from that (non-country) code.
  languageCode: string | null;
  // Defect 1 fix: the geo bundle captured alongside `authorizedInput`, sent
  // purely so the server can persist it for a later restore.
  geo: KeywordResearchGeoBundle | null;
};

/**
 * What is on screen for the run the URL names. An earlier run's query stays
 * disabled: it shows only what the cache holds, its error, or the fetch it
 * already started (two quick searches: the first is still on its way, and
 * calling it "not loaded" would invite paying for it twice). With none of
 * those, nothing is shown -- the tab is not loaded, never empty, and never
 * filled with another search's rows.
 */
function resolveShownRequest(
  request: KeywordResearchRequest | null,
  query: {
    live: boolean;
    hasData: boolean;
    isError: boolean;
    isFetching: boolean;
  },
): KeywordResearchRequest | null {
  if (request === null) return null;
  return query.live || query.hasData || query.isError || query.isFetching
    ? request
    : null;
}

type ShownLabelsSource = {
  shown: KeywordResearchRequest | null;
  data: { source: ResearchSource; usedFallback?: boolean } | undefined;
  restoredRun: {
    label: string;
    result: z.infer<typeof keywordResearchResultSchema>;
  } | null;
};

/** The labels for what is on screen: the session result, else the restored run. */
function describeShownResult({ shown, data, restoredRun }: ShownLabelsSource) {
  const keyword = shown?.seedKeyword ?? restoredRun?.label ?? "";
  return {
    lastResultSource:
      data?.source ??
      restoredRun?.result.source ??
      ("related" as ResearchSource),
    lastUsedFallback:
      data?.usedFallback ?? restoredRun?.result.usedFallback ?? false,
    lastSearchKeyword: keyword,
    lastSearchLocationCode:
      shown?.locationCode ??
      restoredRun?.result.scope?.locationCode ??
      DEFAULT_LOCATION_CODE,
    searchedKeyword: keyword,
  };
}

/**
 * The session run that answers the search the URL names (see
 * keywordSessionRuns.ts), as this hook needs it.
 */
type SessionResearchRun = {
  input: KeywordResearchQueryInput;
  /** The nonce its query is cached under -- reusing it is what finds it. */
  nonce: number;
  /**
   * Only the run the user just submitted may fetch. Any earlier run is read
   * from the cache or reported as not loaded, so switching tabs never spends.
   */
  live: boolean;
  capture: AuthorizedCapture;
};

export function useKeywordResearchData(
  input: KeywordResearchQueryInput,
  addSearch: AddSearchFn,
  sessionRun: SessionResearchRun | null,
  /** False once this session has run a search or left for Recent searches. */
  autoRestoreAllowed: boolean,
) {
  const { projectId } = input;
  const request = useMemo<KeywordResearchRequest | null>(
    () =>
      sessionRun
        ? buildKeywordResearchRequest(
            sessionRun.input,
            sessionRun.capture.languageCode ?? undefined,
            sessionRun.capture.geo ?? undefined,
          )
        : null,
    [sessionRun],
  );
  const queryKey = useMemo(
    () => buildKeywordResearchQueryKey(request),
    [request],
  );
  const queryKeyString = JSON.stringify(queryKey);

  const researchQuery = useMeteredQuery({
    authorized: sessionRun?.live ?? false,
    runNonce: sessionRun?.nonce,
    queryKey,
    queryFn: () => {
      if (!request) {
        throw new Error("Keyword research query ran without request params");
      }

      return keywordResearchQueryFn(request);
    },
    enabled: request !== null,
  });

  const shown = resolveShownRequest(request, {
    live: sessionRun?.live === true,
    hasData: researchQuery.data !== undefined,
    isError: researchQuery.isError,
    isFetching: researchQuery.isFetching,
  });
  // A matched run whose result the cache no longer holds.
  const matchedButUncached = request !== null && shown === null;

  // A Set, not the last key: switching back to a tab re-presents a success
  // that was already recorded, and history/analytics must count it once.
  const handledSuccessKeysRef = useRef(new Set<string>());
  useEffect(() => {
    if (!shown || !researchQuery.isSuccess || !researchQuery.data) return;
    // Per RUN, not per search: Search again with the same settings is a new
    // (paid) run and is recorded as one.
    const runKey = `${queryKeyString}#${sessionRun?.nonce ?? ""}`;
    if (handledSuccessKeysRef.current.has(runKey)) return;
    handledSuccessKeysRef.current.add(runKey);

    captureClientEvent("keyword_research:search_complete", {
      location_code: shown.locationCode,
      search_mode: shown.mode,
      clickstream: shown.clickstream,
      result_count: researchQuery.data.rows.length,
    });

    addSearch(
      shown.seedKeyword,
      shown.locationCode,
      LOCATIONS[shown.locationCode] || "Unknown",
    );
  }, [
    addSearch,
    queryKeyString,
    sessionRun?.nonce,
    shown,
    researchQuery.data,
    researchQuery.isSuccess,
  ]);

  // With nothing searched for, the query above stays disabled and the tab shows
  // only its empty state. Restoring the project's last run fills it in for
  // free: it reads a stored row plus the R2 object that run already paid for,
  // and can never trigger a metered fetch. The SERP-analysis panel stays keyed
  // to a keyword the user clicks, so a restore never fans out into paid calls.
  //
  // Automatic only before this session has searched (or left for Recent
  // searches): after that, an unrelated past run appearing under a tab -- or
  // over the Recent searches list -- would misreport what is on screen. A run
  // the user picks from the rail still restores.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  // A run picked from the rail belongs to the view it was picked in; a new
  // search in the URL (another tab, Recent searches) drops it.
  const urlKeyword = input.keywordInput;
  useEffect(() => {
    setSelectedRunId(null);
  }, [urlKeyword]);
  const restoreEnabled =
    shown === null &&
    (selectedRunId !== null || (autoRestoreAllowed && !matchedButUncached));
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.keywordResearch,
    schema: keywordResearchResultSchema,
    enabled: restoreEnabled,
    runId: selectedRunId,
  });
  // An AUTOMATIC restore never puts another search's stored rows under the
  // search the URL names. A run the user picked from the rail is shown as
  // picked (the rail labels it), and is dropped when the search changes.
  const restoredRun =
    restoreEnabled &&
    restored &&
    (selectedRunId !== null || restoredRunAnswers(urlKeyword, restored.label))
      ? restored
      : null;

  // A restored run counts as "searched" for the UI's purposes — it has rows to
  // show — but never re-enables the live query, which is gated on `request`.
  const hasSearched = shown !== null || restoredRun != null;
  const rows =
    shown !== null
      ? (researchQuery.data?.rows ?? [])
      : (restoredRun?.result.rows ?? []);
  const researchError =
    shown !== null && researchQuery.isError
      ? getStandardErrorMessage(researchQuery.error, "Research failed.")
      : null;

  return {
    rows,
    hasSearched,
    lastSearchError: shown !== null && researchQuery.isError,
    ...describeShownResult({
      shown,
      data: researchQuery.data,
      restoredRun,
    }),
    researchError,
    researchMutationError: researchQuery.error,
    // `shown !== null`, not `hasSearched`: a disabled query still reports
    // isPending in react-query v5, so a restored run (or an earlier run read
    // from cache) would otherwise render a loading skeleton forever.
    isLoading: shown !== null && researchQuery.isPending,
    researchQuery,
    retryResearch: researchQuery.refetch,
    restoredRun,
    selectedRunId,
    setSelectedRunId,
  };
}
