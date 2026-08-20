import { memo, useMemo } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { ExternalUrlCell } from "@/client/components/table/url";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { formatNumber } from "@/client/features/domain/utils";
import { momentumLabel } from "./queryMomentum";
import { KEYWORD_TARGET_SORT_SPECS } from "./keywordTargetsSorting";
import { opportunityActionLabel } from "./opportunityActions";
import type { KeywordTargetRow } from "./mergeKeywordRows";

const columnHelper = createColumnHelper<KeywordTargetRow>();

/**
 * The one glyph this table uses for "we have no value here", in the one
 * colour.
 *
 * `formatNumber(null)` returns a hyphen in the inherited colour, while every
 * hand-written empty cell here renders an em dash at `text-base-content/40`.
 * Two different marks for the same meaning, side by side in the same row,
 * read as two different meanings.
 */
function EmptyCell() {
  return <span className="text-base-content/40">—</span>;
}

/**
 * The Rank cell.
 *
 * Shows the live SERP position when Labs has one, and otherwise Search
 * Console's average with a visible `avg` marker. The marker is not decoration:
 * a GSC average is a property-level mean across every impression and names no
 * URL, so presenting it bare as "you rank #7" is a claim we cannot support.
 * There is deliberately no arithmetic between the two numbers anywhere.
 *
 * The explanation lives in `HeaderHelpLabel` rather than a `title` attribute
 * because `title` is mouse-hover-only and most screen readers do not announce
 * it; `HeaderHelpLabel` is a positioned tooltip with `role="tooltip"` wired
 * through `aria-describedby` (see SortableHeader and the backlinks overview
 * stat tiles), so this cell reuses it rather than inventing a second tooltip
 * mechanism. `focusable` is passed because that argument only holds with it:
 * this trigger stands alone in a `<td>` with no focusable ancestor to lend it
 * a tab stop, so without `focusable` the replacement would be exactly as
 * keyboard-unreachable as the `title` it replaced.
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
            focusable
            label="avg"
            helpText="Search Console's average position for this query across your whole site. It is an average across every impression and does not name a single page, so it is not a SERP rank — and sorting by Rank ignores it."
          />
        </span>
      </span>
    );
  }
  return <EmptyCell />;
}

/**
 * The "Your URL" cell, and the reason it is not just a link.
 *
 * Two different things arrive in `row.url`. Labs names the exact page Google
 * ranks for the keyword. Search Console offers its dominant page: whichever
 * page took the largest KNOWN share of that query's impressions, which is an
 * estimate that can sit well under half — `opportunityActions.ts` treats a
 * share below 0.6 as "no single page owns this query" and changes its whole
 * recommendation because of it. Rendering both bare in one column presents
 * the second as if it were the first.
 *
 * So a GSC-derived URL carries the same visible marker treatment the Rank
 * column already uses for a GSC average, with the actual share named in the
 * tooltip when we have it.
 */
function UrlCell({ row, domain }: { row: KeywordTargetRow; domain: string }) {
  const link = (
    <ExternalUrlCell
      value={row.url}
      label={row.url ?? ""}
      baseDomain={domain}
      // Matches `EmptyCell`'s glyph; ExternalUrlCell already renders its
      // empty state at text-base-content/40.
      empty="—"
    />
  );

  if (row.urlSource !== "impressions") return link;

  const share =
    row.pageShare == null
      ? "Search Console does not report how much of this query's impressions it takes."
      : `It takes ${Math.round(row.pageShare * 100)}% of this query's known impressions.`;

  return (
    <span className="inline-flex items-center gap-1">
      {link}
      <span className="shrink-0 text-xs text-base-content/50">
        <HeaderHelpLabel
          focusable
          label="est."
          helpText={`Search Console's estimate, not a ranking URL: the page taking the largest known share of this query's impressions. ${share}`}
        />
      </span>
    </span>
  );
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
      // SORTING MUST NOT BLEND THE TWO RANK SOURCES, so this column sorts on
      // `serpRank` ALONE and pins every row without one to the bottom, in
      // both directions. A GSC property average and a Labs SERP position are
      // different measurements, and any ordering that interleaves them is
      // the blended rank this feature exists to avoid.
      //
      // The accessor and `sortUndefined` for this and the next three columns
      // live in keywordTargetsSorting.ts, which exists so a headless
      // table-core test can pin them -- see that file for the two silent
      // regressions it guards (`?? null` instead of `?? undefined`, and a
      // dropped `sortUndefined`).
      //
      // Rows pinned at the bottom keep `mergeKeywordRows`' own
      // volume-descending order among themselves -- but NOT via table-core's
      // `rowA.index - rowB.index` tiebreak, which two undefined values never
      // reach: the `sortUndefined` branch returns a constant 1 for that pair
      // and exits first. They stay in order because a constant-1 comparator
      // reads to TimSort as a single already-ascending run, so nothing
      // moves. Correct behaviour, different mechanism.
      columnHelper.accessor(KEYWORD_TARGET_SORT_SPECS.rank.accessorFn, {
        id: "rank",
        sortUndefined: KEYWORD_TARGET_SORT_SPECS.rank.sortUndefined,
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Rank"
            helpText="Sorts by the live SERP position from ranked-keywords data. Rows showing a Search Console average (avg) have no SERP position, so they always sort to the bottom — the two numbers are different measurements and are never ordered against each other."
          />
        ),
        cell: ({ row }) => <RankCell row={row.original} />,
      }),
      columnHelper.accessor(KEYWORD_TARGET_SORT_SPECS.searchVolume.accessorFn, {
        id: "searchVolume",
        sortUndefined: KEYWORD_TARGET_SORT_SPECS.searchVolume.sortUndefined,
        header: ({ column }) => (
          <SortableHeader column={column} label="Volume" />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? <EmptyCell /> : formatNumber(value);
        },
      }),
      columnHelper.accessor(
        KEYWORD_TARGET_SORT_SPECS.keywordDifficulty.accessorFn,
        {
          id: "keywordDifficulty",
          sortUndefined:
            KEYWORD_TARGET_SORT_SPECS.keywordDifficulty.sortUndefined,
          header: ({ column }) => (
            <SortableHeader
              column={column}
              label="KD"
              helpText="Organic ranking difficulty (0-100): higher means harder to reach Google's top 10. Only keywords covered by ranking data have one."
            />
          ),
          cell: ({ getValue }) => (
            <DifficultyBadge value={getValue() ?? null} />
          ),
        },
      ),
      // Sorts on the percentage swing, so the biggest movers group at either
      // end. A row with no readable swing sorts last in both directions
      // rather than being treated as 0%: `percent` is null both for a
      // Labs-only keyword (Search Console has nothing to say about it) and
      // for a row under MIN_IMPRESSIONS_FOR_VERDICT, and neither is "flat".
      columnHelper.accessor(KEYWORD_TARGET_SORT_SPECS.trend.accessorFn, {
        id: "trend",
        sortUndefined: KEYWORD_TARGET_SORT_SPECS.trend.sortUndefined,
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Trend"
            helpText="Change in Search Console impressions against the previous period. Rows with too few impressions to call, or with no Search Console data at all, sort last."
          />
        ),
        cell: ({ row }) =>
          row.original.momentum ? (
            <span className="text-sm">
              {momentumLabel(row.original.momentum)}
            </span>
          ) : (
            // Blank, not zero: Search Console has nothing to say about a
            // keyword this site gets no impressions for.
            <EmptyCell />
          ),
      }),
      columnHelper.display({
        id: "url",
        header: () => "Your URL",
        cell: ({ row }) => <UrlCell row={row.original} domain={domain} />,
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
            <EmptyCell />
          ),
      }),
    ],
    [domain],
  );

  const table = useAppTable({
    data: rows,
    columns,
    // Up to 100 rows arrive at once and none of them are paginated or
    // re-fetched, so sorting is pure client-side reordering -- no request,
    // no cost. Without `withSorting` the headers above would render their
    // arrows and do nothing.
    withSorting: true,
    getRowId: (row) => row.keyword,
  });

  return (
    <div className="overflow-x-auto">
      <AppDataTable
        table={table}
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
