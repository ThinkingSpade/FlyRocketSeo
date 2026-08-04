import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { CITY_SITE_PAGE_SIZES, parseCitySitePageSize } from "./citySiteStatus";

/**
 * Paging controls for the registry.
 *
 * Takes `totalCount` and `totalPages` rather than deriving them, because the
 * two orderings compute them differently: hostname order gets its total from
 * D1, while clicks order gets it from the Search Console ranking the page is
 * sliced out of. Deriving here would silently pick one and be wrong in the
 * other mode.
 */
export function CitySitesPagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: (typeof CITY_SITE_PAGE_SIZES)[number];
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: (typeof CITY_SITE_PAGE_SIZES)[number]) => void;
}) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalCount, page * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm tabular-nums text-base-content/70">
        {start.toLocaleString()}–{end.toLocaleString()} of{" "}
        {totalCount.toLocaleString()}
      </span>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-base-content/70">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            className="select select-bordered select-sm w-20"
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(parseCitySitePageSize(event.target.value))
            }
          >
            {CITY_SITE_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm tabular-nums text-base-content/70">
            Page {page.toLocaleString()} of {totalPages.toLocaleString()}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Floating bar for the current selection. */
export function CitySitesBulkBar({
  selectedCount,
  removing,
  onClear,
  onTrackRanks,
  onRemove,
}: {
  selectedCount: number;
  removing: boolean;
  onClear: () => void;
  onTrackRanks: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-center p-4">
      <div className="flex items-center gap-3 rounded-full border border-base-300 bg-base-100 px-4 py-2 shadow-lg">
        <span className="text-sm tabular-nums">
          {selectedCount.toLocaleString()} selected
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onTrackRanks}
        >
          <TrendingUp className="size-4" />
          Track ranks
        </button>
        <button
          type="button"
          className="btn btn-error btn-sm"
          disabled={removing}
          onClick={onRemove}
        >
          {removing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Remove
        </button>
      </div>
    </div>
  );
}
