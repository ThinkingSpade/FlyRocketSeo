import {
  Copy,
  FileArrowDown,
  ChartLine,
  Table,
  Tag,
  Trash,
} from "@phosphor-icons/react";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";

export function SavedKeywordsBulkActionBar({
  selectedCount,
  onCopy,
  onOpenTags,
  onTrackRanks,
  onExportCsv,
  onExportSheets,
  onDelete,
  onClear,
  exportingSelection,
}: {
  selectedCount: number;
  onCopy: () => void;
  onOpenTags: () => void;
  onTrackRanks: () => void;
  onExportCsv: () => void;
  onExportSheets: () => void;
  onDelete: () => void;
  onClear: () => void;
  exportingSelection: "csv" | "sheets" | null;
}) {
  if (selectedCount === 0) return null;
  const exportBusy = exportingSelection != null;

  return (
    <TableBulkActionBar
      selectedCount={selectedCount}
      onClear={onClear}
      actions={
        <>
          <div className="flex items-center gap-0.5 px-1.5">
            <TableBulkActionButton
              icon={<Tag className="size-3.5" />}
              onClick={onOpenTags}
            >
              Tag
            </TableBulkActionButton>

            <TableBulkActionButton
              icon={<ChartLine className="size-3.5" />}
              onClick={onTrackRanks}
            >
              Track ranks
            </TableBulkActionButton>

            <TableBulkExportMenu
              busy={exportBusy}
              actions={[
                {
                  label: "Copy keywords",
                  icon: <Copy className="size-4" />,
                  onClick: onCopy,
                },
                {
                  label: "Export to Sheets",
                  icon: <Table className="size-4" />,
                  onClick: onExportSheets,
                },
                {
                  label: "Export CSV",
                  icon: <FileArrowDown className="size-4" />,
                  onClick: onExportCsv,
                },
              ]}
            />
          </div>

          <div className="flex items-center border-l border-base-content/10 px-1.5">
            <TableBulkActionButton
              icon={<Trash className="size-3.5" />}
              onClick={onDelete}
              variant="danger"
            >
              Delete
            </TableBulkActionButton>
          </div>
        </>
      }
    />
  );
}
