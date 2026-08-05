import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { getRecentRuns, restoreRun } from "@/serverFunctions/analysisRuns";
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
  const queryClient = useQueryClient();
  const [checkingRunId, setCheckingRunId] = useState<string | null>(null);
  const [expiredRunIds, setExpiredRunIds] = useState<Set<string>>(
    () => new Set(),
  );
  const query = useQuery({
    queryKey: ["analysisRuns", "recent", projectId, feature],
    queryFn: () => getRecentRuns({ data: { projectId, feature, limit: 10 } }),
    staleTime: 60_000,
  });

  // A failed history fetch is not an empty history. Hiding the section on
  // error made a transport failure look like "you have only run this once".
  if (query.isError) {
    return (
      <section className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs text-base-content/60">
        Couldn&rsquo;t load recent runs.{" "}
        <button
          type="button"
          className="link"
          onClick={() => void query.refetch()}
        >
          Retry
        </button>
      </section>
    );
  }

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
          const isExpired = expiredRunIds.has(run.id);
          const isChecking = checkingRunId === run.id;
          return (
            <li key={run.id}>
              <button
                type="button"
                disabled={isExpired || isChecking}
                onClick={() => {
                  setCheckingRunId(run.id);
                  void queryClient
                    .fetchQuery({
                      queryKey: ["analysisRun", run.id, projectId, feature],
                      queryFn: () =>
                        restoreRun({ data: { projectId, runId: run.id } }),
                      staleTime: 60_000,
                    })
                    .then((restored) => {
                      // `restoreRun` now reports WHY rather than returning
                      // null, so this checks the status. Anything that is not
                      // a usable result marks the row expired, which is what
                      // the old null check meant.
                      if (restored.status !== "ready") {
                        setExpiredRunIds((current) => {
                          const next = new Set(current);
                          next.add(run.id);
                          return next;
                        });
                        return;
                      }
                      onSelect(run.id);
                    })
                    .catch(() => {
                      // A transport failure is not proof the run expired, but
                      // it is proof we could not open it. Marking the row is
                      // better than the previous silent no-op, which left the
                      // button looking like it simply did nothing.
                      setExpiredRunIds((current) => {
                        const next = new Set(current);
                        next.add(run.id);
                        return next;
                      });
                    })
                    .finally(() => setCheckingRunId(null));
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-base-200/60 ${
                  isActive ? "bg-base-200/40" : ""
                } disabled:cursor-not-allowed disabled:hover:bg-transparent`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {run.label}
                </span>
                <span className="shrink-0 text-xs text-base-content/50">
                  {isChecking ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin text-base-content/40" />
                      Restoring
                    </span>
                  ) : isExpired ? (
                    "Result expired"
                  ) : (
                    <>
                      {age ?? run.lastRanAt.slice(0, 10)}
                      {run.runCount > 1 ? ` · ${run.runCount}×` : ""}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
