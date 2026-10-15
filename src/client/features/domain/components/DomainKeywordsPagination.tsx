import { domainPaginationRange } from "./domainPaginationRange";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DOMAIN_KEYWORDS_PAGE_SIZES } from "@/types/schemas/domain";
import { Loader } from "@cloudflare/kumo/components/loader";
import { buttonVariants } from "@cloudflare/kumo/components/button";

type Props = {
  rowCount: number;
  page: number;
  pageSize: number;
  totalCount: number | null;
  hasNextPage: boolean;
  isLoading: boolean;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
};

export function DomainKeywordsPagination({
  rowCount,
  page,
  pageSize,
  totalCount,
  hasNextPage,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages =
    totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const canGoPrev = page > 1;
  const canGoNext = totalPages != null ? page < totalPages : hasNextPage;

  return (
    <div className="flex flex-col gap-3 border-t border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-base-content/70 tabular-nums">
        <span role="status" aria-live="polite" aria-atomic="true">
          {domainPaginationRange(page, pageSize, totalCount, rowCount)}
        </span>
        {isLoading ? <Loader size="sm" /> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-base-content/70">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            className="app-select app-select-sm w-20"
            value={pageSize}
            disabled={isLoading}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!isLoading && next !== pageSize) onPageSizeChange(next);
            }}
          >
            {DOMAIN_KEYWORDS_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm tabular-nums text-base-content/70">
            Page {page.toLocaleString()}
            {totalPages != null ? ` of ${totalPages.toLocaleString()}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <PageLink
              page={page - 1}
              disabled={!canGoPrev || isLoading}
              onPageChange={onPageChange}
              label="Previous page"
            >
              <CaretLeft className="size-4" />
            </PageLink>
            <PageLink
              page={page + 1}
              disabled={!canGoNext || isLoading}
              onPageChange={onPageChange}
              label="Next page"
            >
              <CaretRight className="size-4" />
            </PageLink>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  label,
  children,
  onPageChange,
}: {
  page: number;
  disabled: boolean;
  label: string;
  children: ReactNode;
  onPageChange: (nextPage: number) => void;
}) {
  return (
    <Link
      from="/p/$projectId/domain"
      to="/p/$projectId/domain"
      search={(prev) => ({
        ...prev,
        page: page === 1 ? undefined : page,
      })}
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      // A router Link, not a button, so it takes the class string rather than
      // the component. `btn-disabled` has no Kumo equivalent because Kumo's
      // disabled styling comes from the real `disabled` attribute, which an
      // anchor cannot carry — aria-disabled above plus the click guard below
      // are what actually disable this, and the opacity now says so.
      className={`app-touch-target ${buttonVariants({ variant: "ghost", size: "sm", shape: "square" })} ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        onPageChange(page);
      }}
    >
      {children}
    </Link>
  );
}
