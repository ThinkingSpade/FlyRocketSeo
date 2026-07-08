import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import type { KeywordGapRow } from "@/server/features/competitors/services/CompetitorsService";

function formatNumber(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function formatCpc(value: number | null): string {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}

function formatRank(value: number | null): string {
  return value == null ? "—" : String(value);
}

export function KeywordGapTable({
  rows,
  targetLabel,
  competitorLabel,
}: {
  rows: KeywordGapRow[];
  targetLabel: string;
  competitorLabel: string;
}) {
  const columns = useMemo<ColumnDef<KeywordGapRow>[]>(
    () => [
      {
        id: "keyword",
        header: "Keyword",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.keyword}</span>
        ),
      },
      {
        id: "searchVolume",
        header: "Volume",
        cell: ({ row }) => formatNumber(row.original.searchVolume),
      },
      {
        id: "keywordDifficulty",
        header: "KD",
        cell: ({ row }) => formatNumber(row.original.keywordDifficulty),
      },
      {
        id: "cpc",
        header: "CPC",
        cell: ({ row }) => formatCpc(row.original.cpc),
      },
      {
        id: "targetRank",
        header: targetLabel,
        cell: ({ row }) => formatRank(row.original.targetRank),
      },
      {
        id: "competitorRank",
        header: competitorLabel,
        cell: ({ row }) => formatRank(row.original.competitorRank),
      },
    ],
    [targetLabel, competitorLabel],
  );

  const table = useAppTable({ data: rows, columns });

  return (
    <AppDataTable
      table={table}
      empty={
        <div className="px-4 py-8 text-center text-sm text-base-content/60">
          No keywords found for this comparison.
        </div>
      }
    />
  );
}
