import { useQuery } from "@tanstack/react-query";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getSavedKeywords } from "@/serverFunctions/keywords";
import { SuggestionChips } from "@/client/features/insights/SuggestionChips";

/**
 * Picks the keyword the keyword-driven analyses run on.
 *
 * Both suggestion sources are FREE — Search Console, and the project's own
 * saved keywords out of D1 — so offering them costs nothing. The Search
 * Console call reuses the exact query key the dashboard's other cards already
 * populate, so it adds no request of its own.
 *
 * Suggestions carry the number that justifies them (impressions, or search
 * volume) rather than appearing as bare words, so the choice is informed
 * rather than arbitrary.
 */

type SeedSuggestion = {
  keyword: string;
  hint: string;
};

function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function useSeedSuggestions(projectId: string): SeedSuggestion[] {
  // Free: Search Console. Same query key the dashboard's other cards use.
  const gscQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    staleTime: 5 * 60_000,
  });

  // Free: the project's own saved keywords. Only consulted as a fallback, so
  // a connected Search Console keeps this off the critical path.
  const savedQuery = useQuery({
    queryKey: ["savedKeywords", projectId, "seed-suggestions"],
    queryFn: () => getSavedKeywords({ data: { projectId, pageSize: 50 } }),
    staleTime: 5 * 60_000,
  });

  const fromGsc = (gscQuery.data?.queryTotals ?? [])
    .toSorted((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map((row) => ({
      keyword: row.query,
      hint: `${compact(row.impressions)} impressions · pos ${row.position.toFixed(1)}`,
    }));
  if (fromGsc.length > 0) return fromGsc;

  return (savedQuery.data?.rows ?? []).slice(0, 5).map((row) => ({
    keyword: row.keyword,
    hint:
      row.searchVolume != null
        ? `${compact(row.searchVolume)}/mo saved`
        : "saved keyword",
  }));
}

export function SeedKeywordField({
  value,
  suggestions,
  disabled,
  onChange,
}: {
  value: string;
  suggestions: SeedSuggestion[];
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-base-content/70">
          Seed keyword
        </span>
        <input
          type="text"
          className="input input-bordered input-sm"
          value={value}
          placeholder="e.g. office coffee service"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>

      <SuggestionChips
        suggestions={suggestions.map((s) => ({
          value: s.keyword,
          hint: s.hint,
        }))}
        value={value}
        disabled={disabled}
        onSelect={onChange}
      />

      <span className="text-xs text-base-content/50">
        {suggestions.length > 0
          ? "Suggested from your own Search Console and saved keywords — free, and only a starting point."
          : "Used by the keyword, SERP, content and cluster analyses below."}
      </span>
    </div>
  );
}
