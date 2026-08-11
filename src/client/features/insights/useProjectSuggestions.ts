import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getSavedKeywords } from "@/serverFunctions/keywords";
import { buildSuggestions } from "./suggestionModel";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { resolveBrandTerms } from "@/client/features/profiles/profileBrandTerms";
import { useProjectProfile } from "@/client/features/profiles/useProjectProfile";
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
  brandTerms: [],
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

  // Free: shares the dashboard's ["projects"] cache entry. Without it the
  // impression ranking hands back the site's own brand every time.
  const domain = useProjectDomain(projectId);

  const report = gscQuery.data;
  const savedRows = savedQuery.data?.rows;
  // The project's own curated brand names, unioned with the domain stem.
  // This used to be the domain stem alone, so a client whose brand is not
  // their domain had every branded search counted as non-branded -- and the
  // profile field holding the real spellings was read by nothing.
  const { profile } = useProjectProfile(projectId);
  const brandTerms = useMemo(
    () => resolveBrandTerms(profile, domain),
    [profile, domain],
  );

  const signals = useMemo<FreeSignals>(() => {
    const savedKeywords = (savedRows ?? []).map((row) => ({
      keyword: row.keyword,
      searchVolume: row.searchVolume,
    }));
    // The report is a union; the not-connected variant carries only a reason,
    // so an early return is what narrows it to the variant holding the rows.
    if (!report || !report.connected) {
      return { ...EMPTY_SIGNALS, savedKeywords, brandTerms };
    }
    return {
      queryTotals: report.queryTotals,
      queryPages: report.queryPages,
      strikingDistance: report.strikingDistance,
      ctrOpportunities: report.ctrOpportunities,
      savedKeywords,
      brandTerms,
    };
  }, [brandTerms, report, savedRows]);

  return useMemo(
    () => buildSuggestions(signals, intent, limit),
    [signals, intent, limit],
  );
}
