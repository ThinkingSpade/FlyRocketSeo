import { Crosshair } from "lucide-react";
import type { DomainRatings } from "@/client/features/backlinks/useAhrefsDomainRatings";
import { computeSerpStrength, type SerpStrengthInput } from "./serpStrength";

function formatCount(value: number | null): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

/** How hard this SERP is: DR level, traffic bar, and the weakest slot. */
export function SerpStrengthCards({
  results,
  ratings,
}: {
  results: SerpStrengthInput[];
  ratings: DomainRatings | null;
}) {
  const strength = computeSerpStrength(results, ratings);
  if (
    strength.averageDr == null &&
    strength.medianDomainTraffic == null &&
    strength.weakest == null
  ) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-lg border border-base-300 bg-base-100 p-3">
        <div
          className="text-xs font-medium uppercase tracking-wide text-base-content/50"
          title="Average Ahrefs domain rating across the top 10"
        >
          Avg DR (top 10)
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">
          {strength.averageDr ?? "—"}
        </div>
      </div>
      <div className="rounded-lg border border-base-300 bg-base-100 p-3">
        <div
          className="text-xs font-medium uppercase tracking-wide text-base-content/50"
          title="Median whole-domain monthly traffic across the top 10"
        >
          Median domain traffic
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">
          {formatCount(strength.medianDomainTraffic)}
        </div>
      </div>
      <div className="rounded-lg border border-base-300 bg-base-100 p-3">
        <div
          className="text-xs font-medium uppercase tracking-wide text-base-content/50"
          title="Top-10 results on domains with DR under 30"
        >
          Soft spots
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">
          {strength.softSpots}
        </div>
      </div>
      <div className="rounded-lg border border-primary/40 bg-base-100 p-3">
        <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-base-content/50">
          <Crosshair className="size-3" />
          Easiest target
        </div>
        {strength.weakest ? (
          <div className="mt-1 text-sm">
            <span className="font-semibold">#{strength.weakest.rank}</span>{" "}
            <span className="break-all">{strength.weakest.domain}</span>
            <span className="text-base-content/50">
              {" "}
              · DR {strength.weakest.dr}
            </span>
          </div>
        ) : (
          <div className="mt-1 text-xl font-semibold">—</div>
        )}
      </div>
    </div>
  );
}
