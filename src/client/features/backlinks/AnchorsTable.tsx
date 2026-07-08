import { createColumnHelper } from "@tanstack/react-table";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { useMemo } from "react";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import type { AnchorRow } from "./backlinksPageTypes";
import type { AnchorsSortField } from "@/types/schemas/backlinks";
import {
  formatCompactDate,
  formatDecimal,
  formatNumber,
} from "./backlinksPageUtils";

const columnHelper = createColumnHelper<AnchorRow>();

// Column ids map to server-side sort fields; sorting re-queries DataForSEO
// across all anchors, not just the loaded page. The anchor text itself isn't
// a sortable field, so its column is a plain (non-sorting) header.
const columns = [
  columnHelper.accessor("anchor", {
    id: "anchor",
    enableSorting: false,
    header: () => (
      <HeaderHelpLabel
        label="Anchor"
        helpText="The clickable text used in links pointing to your target."
      />
    ),
    cell: ({ getValue }) => getValue() || "(empty anchor)",
  }),
  columnHelper.accessor("backlinks", {
    id: "backlinks" satisfies AnchorsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Backlinks"
        helpText="Total backlinks using this anchor text."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("referringDomains", {
    id: "referringDomains" satisfies AnchorsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Referring Domains"
        helpText="Unique domains using this anchor text."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("rank", {
    id: "rank" satisfies AnchorsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Rank"
        helpText="Combined authority of links using this anchor."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("spamScore", {
    id: "spamScore" satisfies AnchorsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Spam"
        helpText="Spam risk score for links using this anchor."
      />
    ),
    cell: ({ getValue }) => formatDecimal(getValue()),
    sortDescFirst: true,
  }),
  columnHelper.accessor("firstSeen", {
    id: "firstSeen" satisfies AnchorsSortField,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="First Seen"
        helpText="When a link with this anchor was first discovered."
      />
    ),
    cell: ({ getValue }) => formatCompactDate(getValue()),
    sortDescFirst: true,
  }),
];

export function AnchorsTable({
  rows,
  sorting,
  onSortingChange,
}: {
  rows: AnchorRow[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}) {
  const tableColumns = useMemo(() => columns, []);

  const table = useAppTable({
    data: rows,
    columns: tableColumns,
    state: { sorting },
    onSortingChange,
    manualSorting: true,
  });

  if (rows.length === 0) {
    return <EmptyTableState label="No anchors match this filter." />;
  }

  return (
    <AppDataTable
      table={table}
      getCellClassName={(_, columnId) =>
        columnId === "anchor" ? "font-medium break-all" : undefined
      }
    />
  );
}
