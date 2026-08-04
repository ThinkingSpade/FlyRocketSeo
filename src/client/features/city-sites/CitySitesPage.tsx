import * as React from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppPageShell } from "@/client/components/AppPageShell";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getCitySites, removeCitySites } from "@/serverFunctions/citySites";
import type {
  CitySiteMatchStatus,
  CitySiteRow,
} from "@/server/features/city-sites/repositories/CitySiteRepository";
import { CitySiteFixModal } from "./CitySiteFixModal";
import { CitySiteImportModal } from "./CitySiteImportModal";
import { CitySitesTable } from "./CitySitesTable";
import {
  CITY_SITE_PAGE_SIZES,
  CITY_SITE_STATUS_META,
  CITY_SITE_STATUS_ORDER,
  parseCitySitePageSize,
} from "./citySiteStatus";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * One project's city subdomains.
 *
 * Everything on this page is free to use. That is the design constraint, not a
 * side effect: a registry of 2,000 hosts is only worth having if browsing,
 * searching and correcting it costs nothing, so the paid per-city work stays
 * where it already is — on the analysis tabs, one explicit click at a time.
 */
export function CitySitesPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<CitySiteMatchStatus | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<
    (typeof CITY_SITE_PAGE_SIZES)[number]
  >(CITY_SITE_PAGE_SIZES[1]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [showImport, setShowImport] = React.useState(false);
  const [fixTarget, setFixTarget] = React.useState<CitySiteRow | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const listQuery = useQuery({
    queryKey: ["citySites", projectId, { search, status, page, pageSize }],
    queryFn: () =>
      getCitySites({
        data: {
          projectId,
          search: search.trim() || undefined,
          matchStatus: status ?? undefined,
          page,
          pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const rows = listQuery.data?.rows ?? [];
  const totalCount = listQuery.data?.totalCount ?? 0;
  const counts = listQuery.data?.counts;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const registryTotal = counts
    ? counts.matched + counts.ambiguous + counts.unmatched
    : 0;

  // A selection is only meaningful for rows still on screen; changing the
  // filter or page would otherwise leave invisible rows staged for deletion.
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [search, status, page, pageSize]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const removeMutation = useMutation({
    mutationFn: (citySiteIds: string[]) =>
      removeCitySites({ data: { projectId, citySiteIds } }),
    onSuccess: async (result) => {
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({
        queryKey: ["citySites", projectId],
      });
      toast.success(
        `${result.deletedCount.toLocaleString()} site${result.deletedCount === 1 ? "" : "s"} removed`,
      );
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not remove those")),
  });

  const toggleRow = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
  };

  const isEmptyRegistry = registryTotal === 0 && !listQuery.isLoading;

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <AppPageShell>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">City Sites</h1>
            <p className="mt-1 max-w-2xl text-sm text-base-content/60">
              Every city subdomain this project publishes, each pinned to the
              location its data should be pulled for. Importing and browsing
              this list is free.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowImport(true)}
          >
            <Plus className="size-4" />
            Import subdomains
          </button>
        </div>

        {counts ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CoverageCard
              label="Total"
              value={registryTotal}
              active={status === null}
              onClick={() => {
                setStatus(null);
                setPage(1);
              }}
            />
            {CITY_SITE_STATUS_ORDER.map((key) => (
              <CoverageCard
                key={key}
                label={CITY_SITE_STATUS_META[key].label}
                value={counts[key]}
                active={status === key}
                onClick={() => {
                  setStatus(status === key ? null : key);
                  setPage(1);
                }}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-lg border border-base-300 bg-base-100">
          <div className="flex flex-wrap items-center gap-3 border-b border-base-300 px-4 py-3">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-base-300 px-3 py-1.5 focus-within:border-primary">
              <Search className="size-4 shrink-0 text-base-content/45" />
              <input
                type="search"
                className="min-w-0 grow bg-transparent text-sm outline-none placeholder:text-base-content/40"
                placeholder="Search hostname or city"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>
            {listQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin text-base-content/40" />
            ) : null}
          </div>

          {isEmptyRegistry ? (
            <EmptyState onImport={() => setShowImport(true)} />
          ) : totalCount === 0 && !listQuery.isLoading ? (
            <div className="px-4 py-12 text-center text-sm text-base-content/50">
              No city sites match this filter.
            </div>
          ) : (
            <CitySitesTable
              rows={rows}
              selectedIds={selectedIds}
              onToggle={toggleRow}
              onToggleAll={toggleAll}
              onFix={setFixTarget}
            />
          )}

          {totalCount > 0 ? (
            <div className="flex flex-col gap-3 border-t border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm tabular-nums text-base-content/70">
                {(totalCount === 0
                  ? 0
                  : (page - 1) * pageSize + 1
                ).toLocaleString()}
                –{Math.min(totalCount, page * pageSize).toLocaleString()} of{" "}
                {totalCount.toLocaleString()}
              </span>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-base-content/70">
                  <span className="whitespace-nowrap">Rows per page</span>
                  <select
                    className="select select-bordered select-sm w-20"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(parseCitySitePageSize(event.target.value));
                      setPage(1);
                    }}
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
                    Page {page.toLocaleString()} of{" "}
                    {totalPages.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {selectedIds.size > 0 ? (
          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-center p-4">
            <div className="flex items-center gap-3 rounded-full border border-base-300 bg-base-100 px-4 py-2 shadow-lg">
              <span className="text-sm tabular-nums">
                {selectedIds.size.toLocaleString()} selected
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn btn-error btn-sm"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate([...selectedIds])}
              >
                {removeMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Remove
              </button>
            </div>
          </div>
        ) : null}

        {showImport ? (
          <CitySiteImportModal
            projectId={projectId}
            onClose={() => setShowImport(false)}
          />
        ) : null}

        {fixTarget ? (
          <CitySiteFixModal
            projectId={projectId}
            site={fixTarget}
            onClose={() => setFixTarget(null)}
          />
        ) : null}
      </AppPageShell>
    </div>
  );
}

function CoverageCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-base-300 bg-base-100 hover:border-base-content/25"
      }`}
    >
      <div className="text-lg font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-base-content/60">{label}</div>
    </button>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium">No city sites yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-base-content/55">
        Paste your city subdomains and each one is matched to its location
        automatically. Nothing is charged, and you see the matches before
        anything is saved.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm mt-4"
        onClick={onImport}
      >
        <Plus className="size-4" />
        Import subdomains
      </button>
    </div>
  );
}
