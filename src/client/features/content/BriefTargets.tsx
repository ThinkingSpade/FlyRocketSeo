/** The brief's headline targets, derived from the analyzed top pages. */
export function BriefTargets({
  wordCounts,
  h2Counts,
  analyzedCount,
  paaCount,
  analysesPending,
}: {
  wordCounts: number[];
  h2Counts: number[];
  analyzedCount: number;
  paaCount: number;
  analysesPending: boolean;
}) {
  const pendingLabel = analysesPending ? "Analyzing top pages…" : "No data";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Target length
          </span>
          {wordCounts.length > 0 ? (
            <>
              <span className="text-2xl font-semibold tabular-nums">
                ~{quantile(wordCounts, 0.5).toLocaleString()} words
              </span>
              <span className="text-xs text-base-content/60">
                Top pages range {quantile(wordCounts, 0.25).toLocaleString()}–
                {quantile(wordCounts, 0.75).toLocaleString()}
              </span>
            </>
          ) : (
            <span className="text-sm text-base-content/50">{pendingLabel}</span>
          )}
        </div>
      </div>
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Structure
          </span>
          {h2Counts.length > 0 ? (
            <>
              <span className="text-2xl font-semibold tabular-nums">
                ~{quantile(h2Counts, 0.5)} H2 sections
              </span>
              <span className="text-xs text-base-content/60">
                Based on {analyzedCount} analyzed top pages
              </span>
            </>
          ) : (
            <span className="text-sm text-base-content/50">{pendingLabel}</span>
          )}
        </div>
      </div>
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Questions to answer
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {paaCount}
          </span>
          <span className="text-xs text-base-content/60">
            From People-Also-Ask on this SERP
          </span>
        </div>
      </div>
    </div>
  );
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next != null
    ? Math.round(sorted[base] + rest * (next - sorted[base]))
    : Math.round(sorted[base]);
}
