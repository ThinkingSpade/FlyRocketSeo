import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { LOCATIONS, getLanguageCode } from "@/client/features/keywords/utils";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import { researchKeywords } from "@/serverFunctions/keywords";
import { keywordResearchResultSchema } from "@/types/schemas/keywords";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import type {
  KeywordMode,
  ResearchSource,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";

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

type KeywordResearchRequest = {
  projectId: string;
  keywords: string[];
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

export const KEYWORD_RESEARCH_STALE_TIME_MS = 24 * 60 * 60 * 1000;

export function buildKeywordResearchRequest(
  input: KeywordResearchQueryInput,
): KeywordResearchRequest | null {
  const keywords = parseKeywordInput(input.keywordInput);
  const seedKeyword = keywords[0] ?? "";
  if (!seedKeyword) return null;

  return {
    projectId: input.projectId,
    keywords,
    seedKeyword,
    locationCode: input.locationCode,
    languageCode: getLanguageCode(input.locationCode),
    resultLimit: input.resultLimit,
    mode: input.mode,
    clickstream: input.clickstream,
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
    },
  });
}

export function useKeywordResearchData(
  input: KeywordResearchQueryInput,
  addSearch: AddSearchFn,
) {
  const {
    clickstream,
    keywordInput,
    locationCode,
    mode,
    projectId,
    resultLimit,
  } = input;
  const request = useMemo<KeywordResearchRequest | null>(
    () =>
      buildKeywordResearchRequest({
        keywordInput,
        locationCode,
        mode,
        projectId,
        resultLimit,
        clickstream,
      }),
    [clickstream, keywordInput, locationCode, mode, projectId, resultLimit],
  );
  const queryKey = useMemo(
    () => buildKeywordResearchQueryKey(request),
    [request],
  );
  const queryKeyString = JSON.stringify(queryKey);

  const researchQuery = useQuery({
    queryKey,
    queryFn: () => {
      if (!request) {
        throw new Error("Keyword research query ran without request params");
      }

      return keywordResearchQueryFn(request);
    },
    enabled: request !== null,
    staleTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const handledSuccessKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!request || !researchQuery.isSuccess || !researchQuery.data) return;
    if (handledSuccessKeyRef.current === queryKeyString) return;
    handledSuccessKeyRef.current = queryKeyString;

    captureClientEvent("keyword_research:search_complete", {
      location_code: request.locationCode,
      search_mode: request.mode,
      clickstream: request.clickstream,
      result_count: researchQuery.data.rows.length,
    });

    addSearch(
      request.seedKeyword,
      request.locationCode,
      LOCATIONS[request.locationCode] || "Unknown",
    );
  }, [
    addSearch,
    queryKeyString,
    request,
    researchQuery.data,
    researchQuery.isSuccess,
  ]);

  // With nothing searched for, the query above stays disabled and the tab shows
  // only its empty state. Restoring the project's last run fills it in for
  // free: it reads a stored row plus the R2 object that run already paid for,
  // and can never trigger a metered fetch. The SERP-analysis panel stays keyed
  // to a keyword the user clicks, so a restore never fans out into paid calls.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.keywordResearch,
    schema: keywordResearchResultSchema,
    enabled: request === null,
    runId: selectedRunId,
  });
  const restoredRun = request === null ? restored : null;

  // A restored run counts as "searched" for the UI's purposes — it has rows to
  // show — but never re-enables the live query, which is gated on `request`.
  const hasSearched = request !== null || restoredRun != null;
  const rows =
    request !== null
      ? (researchQuery.data?.rows ?? [])
      : (restoredRun?.result.rows ?? []);
  const researchError =
    request !== null && researchQuery.isError
      ? getStandardErrorMessage(researchQuery.error, "Research failed.")
      : null;

  return {
    rows,
    hasSearched,
    lastSearchError: request !== null && researchQuery.isError,
    lastResultSource:
      researchQuery.data?.source ?? ("related" as ResearchSource),
    lastUsedFallback: researchQuery.data?.usedFallback ?? false,
    lastSearchKeyword: request?.seedKeyword ?? restoredRun?.label ?? "",
    lastSearchLocationCode: request?.locationCode ?? DEFAULT_LOCATION_CODE,
    researchError,
    researchMutationError: researchQuery.error,
    searchedKeyword: request?.seedKeyword ?? restoredRun?.label ?? "",
    // `request !== null`, not `hasSearched`: a disabled query still reports
    // isPending in react-query v5, so a restored run would otherwise render a
    // loading skeleton forever.
    isLoading: request !== null && researchQuery.isPending,
    researchQuery,
    retryResearch: researchQuery.refetch,
    restoredRun,
    selectedRunId,
    setSelectedRunId,
  };
}
