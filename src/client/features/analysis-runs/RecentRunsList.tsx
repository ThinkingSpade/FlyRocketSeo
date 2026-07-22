import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { getRecentRuns } from "@/serverFunctions/analysisRuns";
import { formatRunAge } from "@/client/features/analysis-runs/runAge";

/**
 * Everything this project has analysed on a tab, newest first, with when it
 * last ran. Selecting one re-opens its stored result — a free read, so browsing
 * your history never costs anything. Only "Run again" spends.
 *
 * Renders nothing until there are at least two runs: with one, the tab is
 * already showing it and a list of one is just noise.
 */
export function RecentRunsList({
  projectId,
  feature,
  activeRunId,
  onSelect,
}: {
  projectId: string;
  feature: string;
  activeRunId: string | null;
  onSelect: (runId: string | null) => void;
}) {
  const query = useQuery({
    queryKey: ["analysisRuns", "recent", projectId, feature],
    queryFn: () => getRecentRuns({ data: { projectId, feature, limit: 10 } }),
    staleTime: 60_000,
  });

  const runs = query.data ?? [];
  if (runs.length < 2) return null;

  return (
    <section className="rounded-lg border border-base-300 bg-base-100">
      <div className="flex items-center gap-2 border-b border-base-200 px-3 py-2">
        <History className="size-4 text-base-content/40" />
        <h3 className="text-sm font-semibold">Recent runs</h3>
        <span className="text-xs text-base-content/50">
          Re-opening a run is free
        </span>
      </div>
      <ul className="divide-y divide-base-200">
        {runs.map((run, index) => {
          // The newest run is what auto-restore already shows, so it is the
          // active row until the user picks an older one.
          const isActive =
            activeRunId === run.id || (activeRunId == null && index === 0);
          const age = formatRunAge(run.lastRanAt, Date.now());
          return (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => onSelect(index === 0 ? null : run.id)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-base-200/60 ${
                  isActive ? "bg-base-200/40" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {run.label}
                </span>
                <span className="shrink-0 text-xs text-base-content/50">
                  {age ?? run.lastRanAt.slice(0, 10)}
                  {run.runCount > 1 ? ` · ${run.runCount}×` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
