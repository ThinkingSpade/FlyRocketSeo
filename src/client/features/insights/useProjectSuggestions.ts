import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getSavedKeywords } from "@/serverFunctions/keywords";
import { buildSuggestions } from "./suggestionModel";
import type { FreeSignals, SeedSuggestion, SuggestionIntent } from "./types";

/**
 * Assembles the free signals and ranks them for one tab's intent.
 *
 * Both queries deliberately reuse the exact keys other cards already populate,
 * so on a warm cache this hook issues no request at all. Every source is
 * first-party (Search Console) or local (D1) — there is no path from here to a
 * metered provider, which is what lets tabs prefill without spending.
 *
 * A failing source degrades to an empty array rather than an error: a missing
 * Search Console connection should cost you suggestions, not the tab.
 */

const EMPTY_SIGNALS: FreeSignals = {
  queryTotals: [],
  queryPages: [],
  strikingDistance: [],
  ctrOpportunities: [],
  savedKeywords: [],
};

export function useProjectSuggestions(
  projectId: string,
  intent: SuggestionIntent,
  limit?: number,
): SeedSuggestion[] {
  const gscQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    staleTime: 5 * 60_000,
  });

  const savedQuery = useQuery({
    queryKey: ["savedKeywords", projectId, "seed-suggestions"],
    queryFn: () => getSavedKeywords({ data: { projectId, pageSize: 50 } }),
    staleTime: 5 * 60_000,
  });

  const report = gscQuery.data;
  const savedRows = savedQuery.data?.rows;

  const signals = useMemo<FreeSignals>(() => {
    // The report is a discriminated union (`connected: false` when Search
    // Console isn't hooked up); only the connected variant carries the rows.
    const connected = report?.connected === true ? report : null;
    return {
      queryTotals: connected?.queryTotals ?? EMPTY_SIGNALS.queryTotals,
      queryPages: connected?.queryPages ?? EMPTY_SIGNALS.queryPages,
      strikingDistance:
        connected?.strikingDistance ?? EMPTY_SIGNALS.strikingDistance,
      ctrOpportunities:
        connected?.ctrOpportunities ?? EMPTY_SIGNALS.ctrOpportunities,
      savedKeywords: (savedRows ?? []).map((row) => ({
        keyword: row.keyword,
        searchVolume: row.searchVolume,
      })),
    };
  }, [report, savedRows]);

  return useMemo(
    () => buildSuggestions(signals, intent, limit),
    [signals, intent, limit],
  );
}
