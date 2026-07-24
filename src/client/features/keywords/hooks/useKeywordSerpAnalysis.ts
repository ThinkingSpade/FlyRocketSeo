import { useCallback, useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getLanguageCode } from "@/client/features/keywords/utils";
import { getSerpAnalysis } from "@/serverFunctions/keywords";
import {
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";

export function useKeywordSerpAnalysis(
  projectId: string,
  locationCode: number,
) {
  const [serpKeyword, setSerpKeyword] = useState<string | null>(null);
  const [serpPage, setSerpPage] = useState(0);
  const { authorized, authorize, reset } = useAuthorizedRun();
  const SERP_PAGE_SIZE = 10;

  const serpQuery = useMeteredQuery({
    authorized,
    enabled: serpKeyword != null,
    queryKey: ["serpAnalysis", projectId, serpKeyword, locationCode],
    queryFn: () =>
      getSerpAnalysis({
        data: {
          projectId,
          keyword: serpKeyword!,
          locationCode,
          languageCode: getLanguageCode(locationCode),
        },
      }),
  });
  const selectSerpKeyword = useCallback(
    (keyword: string | null) => {
      setSerpKeyword(keyword);
      if (keyword) {
        authorize();
      } else {
        reset();
      }
    },
    [authorize, reset],
  );

  const serpResults = serpQuery.data?.items ?? [];
  const activeSerpKeyword =
    serpKeyword ?? serpQuery.data?.requestedKeyword ?? null;
  const serpLoading = serpQuery.isLoading;
  const serpError = serpQuery.isError
    ? getStandardErrorMessage(serpQuery.error, "Failed to load SERP data.")
    : null;

  return {
    serpKeyword,
    setSerpKeyword: selectSerpKeyword,
    serpPage,
    setSerpPage,
    SERP_PAGE_SIZE,
    serpQuery,
    serpResults,
    activeSerpKeyword,
    serpLoading,
    serpError,
  };
}
