import type { ColumnDef } from "@tanstack/react-table";
import { UserMinus } from "@phosphor-icons/react";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import { SortableHeader } from "./RankTrackingColumns";

/** The suggestion row, narrowed to what this table renders. */
export type SuggestedKeyword = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  traffic: number | null;
};

/** Same mark, same reasoning as Keyword Research's table: only
 *  `wrong-customer` earns a glyph, so the marks stay signal. Here it also
 *  explains why a high-traffic row arrived unticked. */
function FitMarker({ fit }: { fit: FitResult | undefined }) {
  if (fit?.verdict !== "wrong-customer") return null;
  return (
    <UserMinus
      className="size-3.5 shrink-0 text-base-content/40"
      aria-label={fit.reason}
    >
      <title>{fit.reason}</title>
    </UserMinus>
  );
}

/** Built per-render from the verdict map rather than declared once at module
 *  scope, because the keyword cell has to read it. */
export function suggestionColumns(
  fit: ReadonlyMap<string, FitResult>,
): ColumnDef<SuggestedKeyword>[] {
  return [
    {
      id: "keyword",
      accessorKey: "keyword",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="Keyword"
          id="keyword"
          tooltip="The search term this domain ranks for"
        />
      ),
      cell: ({ getValue }) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{getValue<string>()}</span>
          <FitMarker fit={fit.get(getValue<string>())} />
        </span>
      ),
      sortingFn: "alphanumeric",
    },
    {
      id: "position",
      accessorKey: "position",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="Position"
          id="position"
          tooltip="Current Google ranking position"
        />
      ),
      cell: ({ getValue }) => {
        const pos = getValue<number | null>();
        return pos != null ? (
          pos
        ) : (
          <span className="text-base-content/40">—</span>
        );
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.position ?? 999;
        const b = rowB.original.position ?? 999;
        return a - b;
      },
    },
    {
      id: "searchVolume",
      accessorKey: "searchVolume",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="Volume"
          id="searchVolume"
          tooltip="Monthly search volume"
        />
      ),
      cell: ({ getValue }) => {
        const vol = getValue<number | null>();
        return vol != null ? (
          vol.toLocaleString()
        ) : (
          <span className="text-base-content/40">—</span>
        );
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.searchVolume ?? 0;
        const b = rowB.original.searchVolume ?? 0;
        return a - b;
      },
    },
    {
      id: "traffic",
      accessorKey: "traffic",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="Traffic"
          id="traffic"
          tooltip="Estimated monthly organic traffic"
        />
      ),
      cell: ({ getValue }) => {
        const traffic = getValue<number | null>();
        return traffic != null ? (
          Math.round(traffic).toLocaleString()
        ) : (
          <span className="text-base-content/40">—</span>
        );
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.traffic ?? 0;
        const b = rowB.original.traffic ?? 0;
        return a - b;
      },
    },
  ];
}
