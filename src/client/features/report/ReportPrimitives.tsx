import type { ReactNode } from "react";
import {
  formatCount,
  formatPercent,
  formatPosition,
} from "@/client/features/report/reportModel";

/** Small shared building blocks for the report's data sections. */

export type GscRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

function DeltaChip({
  change,
}: {
  change: { text: string; good: boolean } | null;
}) {
  if (!change) return null;
  return (
    <span
      className={`text-xs font-medium tabular-nums ${
        change.good ? "text-success" : "text-error"
      }`}
    >
      {change.text}
    </span>
  );
}

export function Tile({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: { text: string; good: boolean } | null;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        <DeltaChip change={change ?? null} />
      </div>
    </div>
  );
}

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section space-y-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-base-content/60">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function GscRowsTable({
  rows,
  keyHeader,
}: {
  rows: GscRow[];
  keyHeader: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>{keyHeader}</th>
            <th className="text-right">Clicks</th>
            <th className="text-right">Impressions</th>
            <th className="text-right">CTR</th>
            <th className="text-right">Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="max-w-md">
                <span className="line-clamp-1">{row.key}</span>
              </td>
              <td className="text-right tabular-nums">
                {formatCount(row.clicks)}
              </td>
              <td className="text-right tabular-nums">
                {formatCount(row.impressions)}
              </td>
              <td className="text-right tabular-nums">
                {formatPercent(row.ctr)}
              </td>
              <td className="text-right tabular-nums">
                {formatPosition(row.position)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
