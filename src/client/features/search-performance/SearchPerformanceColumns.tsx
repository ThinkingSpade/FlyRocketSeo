import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { MutableRefObject } from "react";
import { makeSelectionColumn } from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import type { SelectionAnchor } from "@/client/components/table/tableSelection";
import type {
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";

export type Report = Extract<
  Awaited<ReturnType<typeof getSearchPerformanceReport>>,
  { connected: true }
>;
export type SearchPerformanceTableRow = Extract<
  Awaited<ReturnType<typeof getSearchPerformanceTable>>,
  { connected: true }
>["rows"][number];
type DimensionRow = SearchPerformanceTableRow;
type StrikingRow = Report["strikingDistance"][number];

const numberFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return numberFormat.format(Math.round(value));
}

export function formatCtr(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatPosition(value: number): string {
  return value.toFixed(1);
}

const rightAligned = {
  headerClassName: "text-right",
  cellClassName: "text-right tabular-nums",
} as const;

/**
 * A GSC page URL, rendered as a link to the live page.
 *
 * GSC page keys are canonical http(s) URLs of the verified property; the
 * scheme check is defense-in-depth before rendering an href, and a value that
 * fails it degrades to text rather than disappearing.
 *
 * Shared because the striking-distance Page column and the Pages table were
 * showing the same URLs two different ways -- one clickable, one inert -- and
 * every one of these rows is about a page the reader is going to want to look
 * at.
 */
function PageUrlCell({
  value,
  className,
}: {
  value: string;
  className: string;
}) {
  if (!/^https?:\/\//.test(value)) {
    return (
      <span className={className} title={value}>
        {value}
      </span>
    );
  }
  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className={`app-link-subtle ${className}`}
      title={value}
    >
      {value}
    </a>
  );
}

const dimensionHelper = createColumnHelper<DimensionRow>();

export function buildDimensionColumns(
  keyLabel: string,
  /** Whether the key column holds page URLs (the Pages dimension) rather than
   *  query strings. */
  keysArePages: boolean,
): ColumnDef<DimensionRow>[] {
  return [
    dimensionHelper.accessor("key", {
      enableSorting: false,
      header: () => keyLabel,
      cell: ({ getValue }) =>
        keysArePages ? (
          <PageUrlCell value={getValue()} className="block max-w-xl truncate" />
        ) : (
          <span className="block max-w-xl truncate" title={getValue()}>
            {getValue()}
          </span>
        ),
    }),
    dimensionHelper.accessor("clicks", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Clicks" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    dimensionHelper.accessor("impressions", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Impressions" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    dimensionHelper.accessor("ctr", {
      header: ({ column }) => (
        <SortableHeader column={column} label="CTR" align="right" />
      ),
      cell: ({ getValue }) => formatCtr(getValue()),
      meta: rightAligned,
    }),
    dimensionHelper.accessor("position", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Position" align="right" />
      ),
      cell: ({ getValue }) => formatPosition(getValue()),
      meta: rightAligned,
    }),
  ];
}

const strikingHelper = createColumnHelper<StrikingRow>();

export function buildStrikingColumns(
  anchorRef: MutableRefObject<SelectionAnchor | null>,
): ColumnDef<StrikingRow>[] {
  return [
    makeSelectionColumn<StrikingRow>(anchorRef),
    strikingHelper.accessor("query", {
      enableSorting: false,
      header: () => "Query",
      cell: ({ getValue }) => (
        <span className="block max-w-xs truncate" title={getValue()}>
          {getValue()}
        </span>
      ),
    }),
    strikingHelper.accessor("page", {
      enableSorting: false,
      header: () => "Page",
      cell: ({ getValue }) => (
        <PageUrlCell value={getValue()} className="block max-w-sm truncate" />
      ),
    }),
    strikingHelper.accessor("impressions", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Impressions" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    strikingHelper.accessor("clicks", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Clicks" align="right" />
      ),
      cell: ({ getValue }) => formatCount(getValue()),
      meta: rightAligned,
    }),
    strikingHelper.accessor("position", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Position" align="right" />
      ),
      cell: ({ getValue }) => formatPosition(getValue()),
      meta: rightAligned,
    }),
  ];
}
