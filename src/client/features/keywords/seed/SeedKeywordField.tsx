import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { getSavedKeywords } from "@/serverFunctions/keywords";
import { getProjects } from "@/serverFunctions/projects";
import { rankSeedSuggestions, type SeedSuggestion } from "./seedSuggestions";

/**
 * Wires the free suggestion sources into `rankSeedSuggestions`. The Search
 * Console query key matches the dashboard's other cards exactly, so this adds
 * no request of its own; the projects query key matches `BrandedSplitCard`'s,
 * for the same reason — both just want the domain out of an already-fetched
 * list.
 */
export function useSeedSuggestions(projectId: string): SeedSuggestion[] {
  const gscQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    staleTime: 5 * 60_000,
  });

  // Only consulted as a fallback, so a connected Search Console keeps this
  // off the critical path.
  const savedQuery = useQuery({
    queryKey: ["savedKeywords", projectId, "seed-suggestions"],
    queryFn: () => getSavedKeywords({ data: { projectId, pageSize: 50 } }),
    staleTime: 5 * 60_000,
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });
  const domain =
    projectsQuery.data?.find((project) => project.id === projectId)?.domain ??
    "";

  return rankSeedSuggestions({
    gscQueries: gscQuery.data?.queryTotals ?? [],
    savedKeywords: savedQuery.data?.rows ?? [],
    domain,
  });
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

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Lightbulb className="size-3.5 shrink-0 text-base-content/40" />
          {suggestions.map((suggestion) => {
            const active =
              suggestion.keyword.toLowerCase() === value.trim().toLowerCase();
            return (
              <button
                key={suggestion.keyword}
                type="button"
                disabled={disabled}
                onClick={() => onChange(suggestion.keyword)}
                title={suggestion.hint}
                className={`btn btn-xs h-auto min-h-0 gap-1 py-1 font-normal ${
                  active ? "btn-primary" : "btn-ghost border border-base-300"
                }`}
              >
                <span className="max-w-[14rem] truncate">
                  {suggestion.keyword}
                </span>
                {suggestion.branded ? (
                  // A brand term still ranks last (see rankSeedSuggestions),
                  // but stays offered — this just makes picking one a visible
                  // choice rather than an accident.
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wide ${
                      active
                        ? "text-primary-content/60"
                        : "text-base-content/40"
                    }`}
                  >
                    brand
                  </span>
                ) : null}
                <span
                  className={
                    active
                      ? "text-primary-content/70"
                      : "text-base-content/45 tabular-nums"
                  }
                >
                  {suggestion.hint}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <span className="text-xs text-base-content/50">
        {suggestions.length > 0
          ? "Suggested from your own Search Console and saved keywords — free, and only a starting point."
          : "No Search Console queries or saved keywords yet — type a keyword your customers would search for."}
      </span>
    </div>
  );
}
