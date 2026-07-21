import { CircleDot, Crosshair, ShieldHalf, TrendingUp } from "lucide-react";
import { InsightTile } from "@/client/components/InsightTile";
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
      <InsightTile
        icon={ShieldHalf}
        label="Avg DR (top 10)"
        value={strength.averageDr ?? "—"}
        tone="primary"
        title="Average Ahrefs domain rating across the top 10"
      />
      <InsightTile
        icon={TrendingUp}
        label="Median domain traffic"
        value={formatCount(strength.medianDomainTraffic)}
        tone="info"
        title="Median whole-domain monthly traffic across the top 10"
      />
      <InsightTile
        icon={CircleDot}
        label="Soft spots"
        value={strength.softSpots}
        tone={strength.softSpots > 0 ? "success" : "neutral"}
        hint="Top-10 results with DR under 30"
      />
      <InsightTile
        icon={Crosshair}
        label="Easiest target"
        tone="primary"
        value={
          strength.weakest ? (
            <span className="text-sm font-semibold">
              #{strength.weakest.rank}{" "}
              <span className="break-all">{strength.weakest.domain}</span>
            </span>
          ) : (
            "—"
          )
        }
        hint={
          strength.weakest
            ? `DR ${strength.weakest.dr} — the slot a strong page can take`
            : undefined
        }
      />
    </div>
  );
}
