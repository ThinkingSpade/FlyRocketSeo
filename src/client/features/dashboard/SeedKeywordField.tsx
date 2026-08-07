import { useQuery } from "@tanstack/react-query";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getSavedKeywords } from "@/serverFunctions/keywords";
import { SuggestionChips } from "@/client/features/insights/SuggestionChips";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import {
  defaultBrandTerms,
  isBrandSeed,
  isBrandedQuery,
} from "@/client/features/search-performance/brandedSplit";
import { Input } from "@cloudflare/kumo/components/input";

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

/** Keeps each side in its incoming order, so the ranking within a side holds. */
function brandedLast<T extends { branded: boolean }>(
  rows: T[],
): Omit<T, "branded">[] {
  return [
    ...rows.filter((row) => !row.branded),
    ...rows.filter((row) => row.branded),
  ].map(({ branded: _branded, ...rest }) => rest);
}

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

  // Free: shares the dashboard's ["projects"] cache entry.
  const domain = useProjectDomain(projectId);
  const brandTerms = domain ? defaultBrandTerms(domain) : [];

  // Only the connected variant of the report carries rows.
  const gscReport = gscQuery.data;
  const fromGsc = (
    gscReport && "queryTotals" in gscReport ? gscReport.queryTotals : []
  )
    .toSorted((a, b) => b.impressions - a.impressions)
    .map((row) => ({
      keyword: row.query,
      hint: `${compact(row.impressions)} impressions · pos ${row.position.toFixed(1)}`,
      // On every site the top-impression query is the brand, so ranking by
      // impressions alone prefilled the analysis with the site's own name.
      // Branded queries are still offered — last, so choosing one is a
      // decision rather than an accident.
      branded: isBrandSeed(row.query, row.position, brandTerms),
    }));
  if (fromGsc.length > 0) return brandedLast(fromGsc).slice(0, 5);

  // Same ordering as the Search Console path. A project with no Search Console
  // data yet is the one most likely to have saved its own brand as a keyword,
  // so this fallback is where leading with the brand would hurt most.
  const fromSaved = (savedQuery.data?.rows ?? []).map((row) => ({
    keyword: row.keyword,
    hint:
      row.searchVolume != null
        ? `${compact(row.searchVolume)}/mo saved`
        : "saved keyword",
    branded: isBrandedQuery(row.keyword, brandTerms),
  }));
  return brandedLast(fromSaved).slice(0, 5);
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
        <Input
          passwordManagerIgnore
          type="text"
          size="sm"
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
