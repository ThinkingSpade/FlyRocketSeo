import {
  CaretDown,
  Download,
  FileArrowDown,
  CircleNotch,
  ArrowsClockwise,
  GridFour,
} from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";

export function SavedKeywordsHeader({
  totalCount,
  exporting,
  metricsRefreshing,
  onExportCsv,
  onExportSheets,
  onRefreshMetrics,
}: {
  totalCount: number;
  exporting: "csv" | "sheets" | null;
  metricsRefreshing: boolean;
  onExportCsv: () => void;
  onExportSheets: () => void;
  onRefreshMetrics: () => void;
}) {
  const disabled = totalCount === 0 || exporting != null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Saved Keywords</h1>
        <p className="text-sm text-base-content/70">
          Save keyword ideas from research, organize them with tags, and revisit
          when you&apos;re ready to act.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              // aria-haspopup is Kumo's to set now — hand-writing it here
              // would fight the trigger's own ARIA.
              <Button
                type="button"
                disabled={disabled || metricsRefreshing}
                variant="ghost"
                size="sm"
              >
                <ArrowsClockwise
                  className={`size-4 ${metricsRefreshing ? "animate-spin" : ""}`}
                />
                {metricsRefreshing ? "Updating..." : "Actions"}
                <CaretDown className="size-3 opacity-60" />
              </Button>
            }
          />
          <DropdownMenu.Content align="end" className="w-64">
            <DropdownMenu.Item
              icon={ArrowsClockwise}
              onClick={onRefreshMetrics}
            >
              <span className="flex flex-col items-start">
                <span>Update keyword stats</span>
                <span className="text-xs text-base-content/50">
                  Volume, difficulty &amp; CPC
                </span>
              </span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                type="button"
                disabled={disabled}
                variant="ghost"
                size="sm"
              >
                {exporting != null ? (
                  <CircleNotch className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Export
                <CaretDown className="size-3 opacity-60" />
              </Button>
            }
          />
          <DropdownMenu.Content align="end" className="w-56">
            <DropdownMenu.Item icon={GridFour} onClick={onExportSheets}>
              Export to Sheets
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={FileArrowDown} onClick={onExportCsv}>
              Export CSV
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    </div>
  );
}
