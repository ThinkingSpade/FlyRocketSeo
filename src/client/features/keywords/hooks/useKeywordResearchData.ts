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

export function useKeywordResearchData(
  input: KeywordResearchQueryInput,
  addSearch: AddSearchFn,
  authorizedInput: KeywordResearchQueryInput | null,
  runNonce: number,
  authorizedCapture: AuthorizedCapture = { languageCode: null, geo: null },
) {
  const { projectId } = input;
  const request = useMemo<KeywordResearchRequest | null>(
    () =>
      authorizedInput
        ? buildKeywordResearchRequest(
            authorizedInput,
            authorizedCapture.languageCode ?? undefined,
            authorizedCapture.geo ?? undefined,
          )
        : null,
    [authorizedInput, authorizedCapture.languageCode, authorizedCapture.geo],
  );
  const queryKey = useMemo(
    () => buildKeywordResearchQueryKey(request),
    [request],
  );
  const queryKeyString = JSON.stringify(queryKey);

  const researchQuery = useMeteredQuery({
    authorized: authorizedInput != null,
    runNonce,
    queryKey,
    queryFn: () => {
      if (!request) {
        throw new Error("Keyword research query ran without request params");
      }

      return keywordResearchQueryFn(request);
    },
    enabled: request !== null,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
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
