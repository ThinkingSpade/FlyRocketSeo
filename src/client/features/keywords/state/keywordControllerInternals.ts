import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { usePreferredKeywordLocation } from "@/client/features/keywords/hooks/usePreferredKeywordLocation";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { saveKeywords } from "@/serverFunctions/keywords";
import type { SaveKeywordsInput } from "@/types/schemas/keywords";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordResearchControllerInput } from "./useKeywordResearchController";

export function useResolvedKeywordLocation(
  input: KeywordResearchControllerInput,
) {
  // The project's own market replaces the bare US constant as the fallback a
  // user with no saved preference gets -- `useProjectMarket` already falls
  // back to the US constant itself while `["projects"]` is in flight or the
  // project has none configured, so this hook never sees an undefined value.
  const projectMarket = useProjectMarket(input.projectId);
  const { preferredLocationCode, setPreferredLocationCode } =
    usePreferredKeywordLocation(projectMarket.locationCode);
  const locationCode =
    !input.hasExplicitLocationCode && input.keywordInput === ""
      ? preferredLocationCode
      : input.locationCode;

  return { locationCode, setPreferredLocationCode };
}

export function useKeywordUiState(initialShowFilters: boolean) {
  const [showFilters, setShowFilters] = useState(initialShowFilters);
  const [selectedKeyword, setSelectedKeyword] =
    useState<KeywordResearchRow | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [mobileTab, setMobileTab] = useState<"keywords" | "serp">("keywords");

  return {
    mobileTab,
    selectedKeyword,
    setMobileTab,
    setSelectedKeyword,
    setShowFilters,
    setShowSaveDialog,
    showFilters,
    showSaveDialog,
  };
}

export function useKeywordSearchParams() {
  const navigate = useNavigate({ from: "/p/$projectId/keywords" });

  return useCallback(
    (updates: Record<string, string | number | boolean | undefined>) => {
      void navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );
}

export function useKeywordSaveMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SaveKeywordsInput) => saveKeywords({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
    },
  });
}
