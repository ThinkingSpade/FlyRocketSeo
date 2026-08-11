import { memo, useMemo } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { ExternalUrlCell } from "@/client/components/table/url";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { formatNumber } from "@/client/features/domain/utils";
import { momentumLabel } from "./queryMomentum";
import { opportunityActionLabel } from "./opportunityActions";
import type { KeywordTargetRow } from "./mergeKeywordRows";

const columnHelper = createColumnHelper<KeywordTargetRow>();

/**
 * The Rank cell.
 *
 * Shows the live SERP position when Labs has one, and otherwise Search
 * Console's average with a visible `avg` marker. The marker is not decoration:
 * a GSC average is a property-level mean across every impression and names no
 * URL, so presenting it bare as "you rank #7" is a claim we cannot support.
 * There is deliberately no arithmetic between the two numbers anywhere.
 *
 * The explanation lives in `HeaderHelpLabel` rather than a `title` attribute:
 * a native `title` is mouse-hover-only and unreachable by keyboard, and most
 * screen readers do not announce it. `HeaderHelpLabel` is this codebase's
 * existing answer to that gap (see SortableHeader and the backlinks overview
 * stat tiles) -- a positioned tooltip with `role="tooltip"` wired through
 * `aria-describedby`, so this cell reuses it rather than inventing a second
 * tooltip mechanism.
 */
function RankCell({ row }: { row: KeywordTargetRow }) {
  if (row.serpRank != null) {
    return <span className="tabular-nums">{row.serpRank}</span>;
  }
  if (row.gscAveragePosition != null) {
    return (
      <span className="inline-flex items-center gap-1 tabular-nums text-base-content/70">
        {Math.round(row.gscAveragePosition)}
        <span className="text-xs text-base-content/50">
          <HeaderHelpLabel
            label="avg"
            helpText="Search Console's average position for this query across your whole site. It is an average across every impression and does not name a single page, so it is not a SERP rank."
          />
        </span>
      </span>
    );
  }
  return <span className="text-base-content/40">—</span>;
}

function KeywordTargetsTableComponent({
  rows,
  domain,
  emptyMessage,
}: {
  rows: KeywordTargetRow[];
  domain: string;
  /** What an empty table means HERE -- the card decides, because only it
   *  knows whether Search Console was actually readable. */
  emptyMessage: string;
}) {
  const columns = useMemo<ColumnDef<KeywordTargetRow>[]>(
    () => [
      columnHelper.accessor("keyword", {
        header: () => "Keyword",
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue()}</span>
        ),
      }),
      columnHelper.display({
        id: "rank",
        header: () => "Rank",
        cell: ({ row }) => <RankCell row={row.original} />,
      }),
      columnHelper.accessor("searchVolume", {
        header: () => "Volume",
        cell: ({ getValue }) => formatNumber(getValue()),
      }),
      columnHelper.accessor("keywordDifficulty", {
        header: () => "KD",
        cell: ({ getValue }) => <DifficultyBadge value={getValue()} />,
      }),
      columnHelper.display({
        id: "trend",
        header: () => "Trend",
        cell: ({ row }) =>
          row.original.momentum ? (
            <span className="text-sm">
              {momentumLabel(row.original.momentum)}
            </span>
          ) : (
            // Blank, not zero: Search Console has nothing to say about a
            // keyword this site gets no impressions for.
            <span className="text-base-content/40">—</span>
          ),
      }),
      columnHelper.display({
        id: "url",
        header: () => "Your URL",
        cell: ({ row }) => (
          <ExternalUrlCell
            value={row.original.url}
            label={row.original.url ?? ""}
            baseDomain={domain}
          />
        ),
        meta: { cellClassName: "max-w-[240px] truncate" },
      }),
      columnHelper.display({
        id: "action",
        header: () => "Action",
        cell: ({ row }) =>
          row.original.action ? (
            <span className="text-sm">
              {opportunityActionLabel(row.original.action)}
            </span>
          ) : (
            <span className="text-base-content/40">—</span>
          ),
      }),
    ],
    [domain],
  );

  const table = useAppTable({
    data: rows,
    columns,
    getRowId: (row) => row.keyword,
  });

  return (
    <div className="overflow-x-auto">
      <AppDataTable
        table={table}
        className="table table-sm"
        wrapperClassName=""
        empty={
          <div className="py-6 text-center text-base-content/60">
            {emptyMessage}
          </div>
        }
      />
    </div>
  );
}

export const KeywordTargetsTable = memo(KeywordTargetsTableComponent);
