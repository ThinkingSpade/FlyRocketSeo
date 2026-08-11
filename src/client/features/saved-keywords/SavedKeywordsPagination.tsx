import { CaretLeft, CaretRight, CircleNotch } from "@phosphor-icons/react";
import { SAVED_KEYWORD_PAGE_SIZES } from "./savedKeywordsUtils";
import { Button } from "@cloudflare/kumo/components/button";

export function SavedKeywordsPagination({
  page,
  pageSize,
  totalCount,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: (typeof SAVED_KEYWORD_PAGE_SIZES)[number];
  totalCount: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (
    pageSize: (typeof SAVED_KEYWORD_PAGE_SIZES)[number],
  ) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalCount, page * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm tabular-nums text-base-content/70">
        <span>
          {start.toLocaleString()}-{end.toLocaleString()} of{" "}
          {totalCount.toLocaleString()}
        </span>
        {isLoading ? <CircleNotch className="size-3.5 animate-spin" /> : null}
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-base-content/70">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            className="app-select app-select-sm w-20"
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(parsePageSize(event.target.value))
            }
          >
            {SAVED_KEYWORD_PAGE_SIZES.map((size) => (
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
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              shape="square"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <CaretLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              shape="square"
              disabled={page >= totalPages || isLoading}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <CaretRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function parsePageSize(
  value: string,
): (typeof SAVED_KEYWORD_PAGE_SIZES)[number] {
  const parsed = Number(value);
  return SAVED_KEYWORD_PAGE_SIZES.find((size) => size === parsed) ?? 50;
}
