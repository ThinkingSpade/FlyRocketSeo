import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { TableExportMenu } from "@/client/components/table/TableBulkActionBar";
import { TableLoadingRows } from "@/client/features/domain/components/TableLoadingRows";
import { Button } from "@cloudflare/kumo/components/button";
import { Badge } from "@cloudflare/kumo/components/badge";

type DomainTableExportAction = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

type Props = {
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  countLabel: string;
  totalCount: number | null;
  fallbackCount: number;
  exportActions: DomainTableExportAction[];
  filterPanel?: ReactNode;
  isLoading: boolean;
  showTableLoading: boolean;
  children: ReactNode;
  pagination: ReactNode;
};

export function DomainTableTabSurface({
  showFilters,
  onToggleFilters,
  activeFilterCount,
  countLabel,
  totalCount,
  fallbackCount,
  exportActions,
  filterPanel,
  isLoading,
  showTableLoading,
  children,
  pagination,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-base-300">
        <Button
          size="sm"
          variant={showFilters ? "secondary" : "ghost"}
          aria-pressed={showFilters}
          onClick={onToggleFilters}
          title="Toggle filters"
          type="button"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeFilterCount > 0 ? (
            <Badge variant="primary" className="border-0 text-primary-content">
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
        <span className="text-sm text-base-content/60">
          {(totalCount ?? fallbackCount).toLocaleString()} {countLabel}
        </span>
        <div className="flex-1" />
        <TableExportMenu actions={exportActions} />
      </div>

      {filterPanel}

      <div className="p-4">
        <div
          className={
            isLoading && !showTableLoading
              ? "opacity-60 transition-opacity"
              : "transition-opacity"
          }
        >
          {showTableLoading ? <TableLoadingRows /> : children}
        </div>
      </div>

      {pagination}
    </>
  );
}
