import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";

/**
 * The two pieces every restored tab shows: the list of past runs (only when the
 * tab has no live query of its own) and the banner naming the run currently on
 * screen. Both are free — browsing history re-reads stored results and never
 * triggers a metered fetch. Only "Run again" spends.
 *
 * Shared because six tabs render exactly this pair; keeping it in one place is
 * what stops the wording drifting apart between them.
 */
export function RestoreRail({
  projectId,
  feature,
  selectedRunId,
  onSelectRun,
  /** True when the tab has no live query — i.e. nothing was searched for. */
  idle,
  restoredRun,
  onRunAgain,
}: {
  projectId: string;
  feature: string;
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  idle: boolean;
  restoredRun: { label: string; lastRanAt: string; runCount: number } | null;
  onRunAgain: () => void;
}) {
  return (
    <>
      {idle ? (
        <RecentRunsList
          projectId={projectId}
          feature={feature}
          activeRunId={selectedRunId}
          onSelect={onSelectRun}
        />
      ) : null}

      {restoredRun ? (
        <RestoredRunBanner
          label={restoredRun.label}
          lastRanAt={restoredRun.lastRanAt}
          runCount={restoredRun.runCount}
          onRunAgain={onRunAgain}
        />
      ) : null}
    </>
  );
}
