import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Header,
  type Row,
  type Table,
  type TableOptions,
} from "@tanstack/react-table";
import {
  useRef,
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  applyShiftRangeSelection,
  type SelectionAnchor,
} from "./tableSelection";
import { Table as KumoTable } from "@cloudflare/kumo/components/table";

type AppColumnMeta<TData> = {
  headerClassName?: string;
  cellClassName?: string | ((row: Row<TData>) => string | undefined);
};

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> extends AppColumnMeta<TData> {
    readonly __valueType?: TValue;
  }
}

type UseAppTableOptions<TData> = Omit<
  TableOptions<TData>,
  "getCoreRowModel"
> & {
  withSorting?: boolean;
  withExpanded?: boolean;
  withPagination?: boolean;
};

export function useAppTable<TData>(options: UseAppTableOptions<TData>) {
  const { withSorting, withExpanded, withPagination, ...tableOptions } =
    options;
  return useReactTable({
    ...tableOptions,
    getCoreRowModel: getCoreRowModel(),
    ...(withSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(withExpanded ? { getExpandedRowModel: getExpandedRowModel() } : {}),
    ...(withPagination
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
  });
}

export function useSelectionAnchor(): MutableRefObject<SelectionAnchor | null> {
  return useRef<SelectionAnchor | null>(null);
}

export function makeSelectionColumn<TData>(
  anchorRef: MutableRefObject<SelectionAnchor | null>,
): ColumnDef<TData> {
  return {
    id: "select",
    size: 32,
    enableSorting: false,
    header: ({ table }) => (
      <input
        type="checkbox"
        className="checkbox checkbox-xs [--radius-selector:0.25rem]"
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
        aria-label="Select all rows"
      />
    ),
    cell: ({ row, table }) => (
      <SelectionCheckbox row={row} table={table} anchorRef={anchorRef} />
    ),
  };
}

function SelectionCheckbox<TData>({
  row,
  table,
  anchorRef,
}: {
  row: Row<TData>;
  table: Table<TData>;
  anchorRef: MutableRefObject<SelectionAnchor | null>;
}) {
  const rangeHandledRef = useRef(false);
  return (
    <input
      type="checkbox"
      className="checkbox checkbox-xs [--radius-selector:0.25rem]"
      checked={row.getIsSelected()}
      aria-label="Select row"
      onClick={(event) => {
        event.stopPropagation();
        rangeHandledRef.current = applyShiftRangeSelection(
          event,
          row,
          table,
          anchorRef,
        );
      }}
      onChange={(event) => {
        if (rangeHandledRef.current) {
          rangeHandledRef.current = false;
          return;
        }
        row.getToggleSelectedHandler()(event);
      }}
    />
  );
}

export function AppDataTable<TData>({
  table,
  className,
  wrapperClassName = "overflow-x-auto",
  empty,
  isLoading,
  loading,
  getRowClassName,
  getRowProps,
  getCellClassName,
  fixedLayout,
  stickyHeader,
}: {
  table: Table<TData>;
  className?: string;
  wrapperClassName?: string;
  empty?: ReactNode;
  isLoading?: boolean;
  loading?: ReactNode;
  getRowClassName?: (row: Row<TData>) => string | undefined;
  getRowProps?: (row: Row<TData>) => {
    onClick?: (event: MouseEvent<HTMLTableRowElement>) => void;
    className?: string;
  };
  getCellClassName?: (row: Row<TData>, columnId: string) => string | undefined;
  fixedLayout?: boolean;
  stickyHeader?: boolean;
}) {
  if (isLoading && loading) return <>{loading}</>;
  if (table.getRowModel().rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className={wrapperClassName}>
      {/* `layout` replaces the inline tableLayout style — Kumo drives the same
          CSS from a prop, and the colgroup below still supplies the widths. */}
      <KumoTable className={className} layout={fixedLayout ? "fixed" : "auto"}>
        {fixedLayout ? (
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
        ) : null}
        <KumoTable.Header>
          {table.getHeaderGroups().map((headerGroup) => (
            <KumoTable.Row key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <HeaderCell
                  key={header.id}
                  header={header}
                  fixedLayout={fixedLayout}
                  stickyHeader={stickyHeader}
                />
              ))}
            </KumoTable.Row>
          ))}
        </KumoTable.Header>
        <KumoTable.Body>
          {table.getRowModel().rows.map((row) => {
            const rowProps = getRowProps?.(row);
            return (
              <KumoTable.Row
                key={row.id}
                // Kumo has a `selected` row variant, and this is where it would
                // go — but selection here is TanStack's, and the existing
                // getRowClassName callbacks already paint it per table. Wiring
                // both would mean two sources of truth for one visual state.
                onClick={rowProps?.onClick}
                className={[getRowClassName?.(row), rowProps?.className]
                  .filter(Boolean)
                  .join(" ")}
              >
                {row.getVisibleCells().map((cell) => {
                  const metaClass = cell.column.columnDef.meta?.cellClassName;
                  return (
                    <KumoTable.Cell
                      key={cell.id}
                      className={[
                        typeof metaClass === "function"
                          ? metaClass(row)
                          : metaClass,
                        getCellClassName?.(row, cell.column.id),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </KumoTable.Cell>
                  );
                })}
              </KumoTable.Row>
            );
          })}
        </KumoTable.Body>
      </KumoTable>
    </div>
  );
}

function HeaderCell<TData>({
  header,
  fixedLayout,
  stickyHeader,
}: {
  header: Header<TData, unknown>;
  fixedLayout?: boolean;
  stickyHeader?: boolean;
}) {
  const meta = header.column.columnDef.meta;
  return (
    <KumoTable.Head
      className={[
        stickyHeader ? "bg-base-200" : undefined,
        meta?.headerClassName,
      ]
        .filter(Boolean)
        .join(" ")}
      style={fixedLayout ? { width: header.getSize() } : undefined}
    >
      {header.isPlaceholder
        ? null
        : flexRender(header.column.columnDef.header, header.getContext())}
    </KumoTable.Head>
  );
}
