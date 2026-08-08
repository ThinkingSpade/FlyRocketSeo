import { Target, Zap } from "lucide-react";
import { PositionDistribution } from "@/client/features/domain/components/PositionDistribution";
import { InsightIcon } from "@/client/components/InsightTile";
import {
  computePositionBuckets,
  computeStrikingDistance,
  computeTrafficConcentration,
  type PageKeyword,
} from "./pageInsights";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Table } from "@cloudflare/kumo/components/table";

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
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
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
              <Badge variant="neutral" className="shrink-0 tabular-nums">
                #{row.position ?? "—"}
              </Badge>
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
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={Target} tone="warning" />
          Striking distance
        </h2>
        <p className="-mt-1 text-xs text-base-content/50">
          Ranked #4–15 — the keywords a content refresh moves onto page-one
          money spots.
        </p>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Keyword</Table.Head>
              <Table.Head className="text-right">Pos</Table.Head>
              <Table.Head className="text-right">Volume</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.keyword}>
                <Table.Cell className="max-w-56">
                  <span className="line-clamp-1">{row.keyword}</span>
                </Table.Cell>
                <Table.Cell className="text-right tabular-nums">
                  {row.position}
                </Table.Cell>
                <Table.Cell className="text-right tabular-nums">
                  {formatCount(row.searchVolume)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
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
