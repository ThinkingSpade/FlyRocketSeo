import { Target, Zap } from "lucide-react";
import { PositionDistribution } from "@/client/features/domain/components/PositionDistribution";
import { InsightIcon } from "@/client/components/InsightTile";
import {
  computePositionBuckets,
  computeStrikingDistance,
  computeTrafficConcentration,
  type PageKeyword,
} from "./pageInsights";

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

/** Traffic concentration: which few keywords carry the page. */
export function TrafficConcentrationCard({
  keywords,
  estimatedTraffic,
}: {
  keywords: PageKeyword[];
  estimatedTraffic: number;
}) {
  const concentration = computeTrafficConcentration(keywords, estimatedTraffic);
  if (!concentration) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={Zap} tone="primary" />
          Traffic concentration
        </h2>
        <ul className="space-y-1.5">
          {concentration.rows.map((row) => (
            <li key={row.keyword} className="flex items-center gap-2 text-sm">
              <span
                className="w-40 shrink-0 truncate xl:w-48"
                title={row.keyword}
              >
                {row.keyword}
              </span>
              <span className="badge badge-ghost badge-xs shrink-0 tabular-nums">
                #{row.position ?? "—"}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-base-200">
                <span
                  className="block h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.round(row.share * 100)}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right text-xs text-base-content/60 tabular-nums">
                {formatCount(row.traffic)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-base-content/50">
          These {concentration.rows.length} keywords drive{" "}
          {Math.round(concentration.topShare * 100)}% of the page&rsquo;s
          estimated traffic.
        </p>
      </div>
    </div>
  );
}

/** Striking distance: positions 4-15 worth a content/meta push. */
export function StrikingDistanceCard({
  keywords,
}: {
  keywords: PageKeyword[];
}) {
  const rows = computeStrikingDistance(keywords);
  if (rows.length === 0) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={Target} tone="warning" />
          Striking distance
        </h2>
        <p className="-mt-1 text-xs text-base-content/50">
          Ranked #4–15 — the keywords a content refresh moves onto page-one
          money spots.
        </p>
        <table className="table table-xs">
          <thead>
            <tr>
              <th>Keyword</th>
              <th className="text-right">Pos</th>
              <th className="text-right">Volume</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.keyword}>
                <td className="max-w-56">
                  <span className="line-clamp-1">{row.keyword}</span>
                </td>
                <td className="text-right tabular-nums">{row.position}</td>
                <td className="text-right tabular-nums">
                  {formatCount(row.searchVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Stacked position-bucket bar, reusing the Domain Overview component. */
export function PageDistributionCard({
  keywords,
}: {
  keywords: PageKeyword[];
}) {
  return <PositionDistribution buckets={computePositionBuckets(keywords)} />;
}
