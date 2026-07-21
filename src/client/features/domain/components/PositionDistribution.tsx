type Buckets = {
  top3: number;
  pos4to10: number;
  pos11to20: number;
  pos21to50: number;
  pos51plus: number;
};

const SEGMENTS: Array<{
  key: keyof Buckets;
  label: string;
  className: string;
}> = [
  { key: "top3", label: "#1–3", className: "bg-success" },
  { key: "pos4to10", label: "#4–10", className: "bg-primary" },
  { key: "pos11to20", label: "#11–20", className: "bg-warning" },
  { key: "pos21to50", label: "#21–50", className: "bg-orange-400" },
  { key: "pos51plus", label: "#51+", className: "bg-base-content/25" },
];

/** Ahrefs-style ranking distribution: how the domain's keywords split across
 *  position buckets, as one stacked bar plus per-bucket counts. */
export function PositionDistribution({ buckets }: { buckets: Buckets }) {
  const total = SEGMENTS.reduce(
    (sum, segment) => sum + buckets[segment.key],
    0,
  );
  if (total === 0) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <p className="text-xs uppercase tracking-wide text-base-content/60">
          Ranking distribution
        </p>
        <div className="flex h-4 w-full overflow-hidden rounded-full">
          {SEGMENTS.map((segment) => {
            const value = buckets[segment.key];
            if (value === 0) return null;
            return (
              <div
                key={segment.key}
                className={segment.className}
                style={{ width: `${(value / total) * 100}%` }}
                title={`${segment.label}: ${value.toLocaleString()} keywords`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/70">
          {SEGMENTS.map((segment) => (
            <span key={segment.key} className="flex items-center gap-1.5">
              <span
                className={`inline-block size-2.5 rounded-full ${segment.className}`}
              />
              {segment.label}
              <span className="font-medium tabular-nums text-base-content">
                {buckets[segment.key].toLocaleString()}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
