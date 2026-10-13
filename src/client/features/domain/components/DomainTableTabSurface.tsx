import type { ReactNode } from "react";
import { SlidersHorizontal } from "@phosphor-icons/react";
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
  /** An unapproved request is not an empty result. */
  awaitingRun?: boolean;
  error?: ReactNode;
  children?: ReactNode;
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
  awaitingRun = false,
  error,
  children,
  pagination,
}: Props) {
  const unavailable = awaitingRun || Boolean(error);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-base-300">
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
          {unavailable
            ? "Results not loaded"
            : isLoading
              ? "Loading results…"
              : `${(totalCount ?? fallbackCount).toLocaleString()} ${countLabel}`}
        </span>
        <div className="flex-1" />
        {!unavailable && !isLoading && fallbackCount > 0 ? (
          <TableExportMenu actions={exportActions} />
        ) : null}
      </div>

      {filterPanel}

      <div className="min-h-32 p-4" aria-busy={isLoading}>
        <div
          className={
            isLoading && !showTableLoading
              ? "opacity-60 transition-opacity"
              : "transition-opacity"
          }
        >
          {error ? (
            error
          ) : awaitingRun ? (
            <div
              role="status"
              className="mx-auto max-w-md py-6 text-center text-sm text-base-content/70"
            >
              Choose your filters, then load results for these settings.
              Changing sorting, filters or pages requires a new confirmation;
              nothing runs automatically.
            </div>
          ) : showTableLoading ? (
            <TableLoadingRows />
          ) : (
            children
          )}
        </div>
      </div>

      {!unavailable ? pagination : null}
    </>
  );
}
