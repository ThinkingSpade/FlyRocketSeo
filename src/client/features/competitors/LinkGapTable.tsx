import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import type { LinkGapRow } from "@/server/features/competitors/services/CompetitorsService";

function formatNumber(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function LinkGapTable({ rows }: { rows: LinkGapRow[] }) {
  const columns = useMemo<ColumnDef<LinkGapRow>[]>(
    () => [
      {
        id: "referringDomain",
        header: "Referring Domain",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.referringDomain}</span>
        ),
      },
      {
        id: "rank",
        header: "Domain Rank",
        cell: ({ row }) => formatNumber(row.original.rank),
      },
      {
        id: "backlinksToCompetitor",
        header: "Links to Competitor",
        cell: ({ row }) => formatNumber(row.original.backlinksToCompetitor),
      },
      {
        id: "spamScore",
        header: "Spam Score",
        cell: ({ row }) =>
          row.original.spamScore == null ? (
            "—"
          ) : (
            <span
              className={
                row.original.spamScore >= 40 ? "text-error font-medium" : ""
              }
            >
              {row.original.spamScore}
            </span>
          ),
      },
      {
        id: "firstSeen",
        header: "First Seen",
        cell: ({ row }) => formatDate(row.original.firstSeen),
      },
    ],
    [],
  );

  const table = useAppTable({ data: rows, columns });

  return (
    <AppDataTable
      table={table}
      empty={
        <div className="px-4 py-8 text-center text-sm text-base-content/60">
          No link gap found — every domain linking to this competitor also links
          to you.
        </div>
      }
    />
  );
}
