import { ClockCounterClockwise } from "@phosphor-icons/react";
import { formatRunAge } from "@/client/features/analysis-runs/runAge";
import { Button } from "@cloudflare/kumo/components/button";

/**
 * Shown when a tab is displaying a restored past run rather than a fresh one,
 * so the numbers on screen are never mistaken for live data. "Run again" is the
 * only path that spends.
 */
export function RestoredRunBanner({
  label,
  lastRanAt,
  runCount,
  onRunAgain,
}: {
  label: string;
  lastRanAt: string;
  runCount: number;
  onRunAgain?: () => void;
}) {
  const age = formatRunAge(lastRanAt, Date.now());

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2">
      <span className="inline-flex flex-wrap items-center gap-1.5 text-sm text-base-content/70">
        <ClockCounterClockwise className="size-4 shrink-0 text-base-content/40" />
        Showing your last run for{" "}
        <span className="font-medium text-base-content">{label}</span>
        {age ? ` · ${age}` : ""}
        {runCount > 1 ? ` · run ${runCount}×` : ""}
      </span>
      {onRunAgain ? (
        <Button type="button" variant="ghost" size="xs" onClick={onRunAgain}>
          Run again
        </Button>
      ) : null}
    </div>
  );
}
