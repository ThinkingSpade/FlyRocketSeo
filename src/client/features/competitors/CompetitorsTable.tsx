import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { GitCompareArrows } from "lucide-react";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import type { CompetitorRow } from "@/server/features/competitors/services/CompetitorsService";

function formatCount(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

export function CompetitorsTable({
  rows,
  onCompareCompetitor,
}: {
  rows: CompetitorRow[];
  onCompareCompetitor: (domain: string) => void;
}) {
  const columns = useMemo<ColumnDef<CompetitorRow>[]>(
    () => [
      {
        id: "domain",
        header: "Competitor",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.domain}</span>
        ),
      },
      {
        id: "intersections",
        header: "Shared Keywords",
        cell: ({ row }) => formatCount(row.original.intersections),
      },
      {
        id: "avgPosition",
        header: "Avg Position",
        cell: ({ row }) =>
          row.original.avgPosition == null
            ? "—"
            : row.original.avgPosition.toFixed(1),
      },
      {
        id: "organicKeywords",
        header: "Organic Keywords",
        cell: ({ row }) => formatCount(row.original.organicKeywords),
      },
      {
        id: "organicTraffic",
        header: "Organic Traffic",
        cell: ({ row }) => formatCount(row.original.organicTraffic),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1"
            onClick={() => onCompareCompetitor(row.original.domain)}
            title="Compare keywords with this competitor"
          >
            <GitCompareArrows className="size-3.5" />
            Keyword Gap
          </button>
        ),
      },
    ],
    [onCompareCompetitor],
  );

  const table = useAppTable({ data: rows, columns });

  return (
    <AppDataTable
      table={table}
      empty={
        <div className="px-4 py-8 text-center text-sm text-base-content/60">
          No competitors found. Try a domain with more organic visibility.
        </div>
      }
    />
  );
}
