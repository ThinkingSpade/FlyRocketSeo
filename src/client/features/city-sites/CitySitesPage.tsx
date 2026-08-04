import * as React from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppPageShell } from "@/client/components/AppPageShell";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getCitySitePerformance,
  getCitySites,
  removeCitySites,
} from "@/serverFunctions/citySites";
import type {
  CitySiteMatchStatus,
  CitySiteRow,
} from "@/server/features/city-sites/repositories/CitySiteRepository";
import { CityRankTrackingModal } from "./CityRankTrackingModal";
import { CitySiteFixModal } from "./CitySiteFixModal";
import { CitySiteImportModal } from "./CitySiteImportModal";
import { CitySitesTable } from "./CitySitesTable";
import { CitySitesBulkBar, CitySitesPagination } from "./CitySitesPagination";
import {
  CoverageCard,
  EmptyState,
  SearchConsoleSummary,
} from "./CitySitesSummary";
import {
  CITY_SITE_PAGE_SIZES,
  CITY_SITE_STATUS_META,
  CITY_SITE_STATUS_ORDER,
  type CitySiteDateRange,
  type CitySiteSort,
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
  const [showRankSetup, setShowRankSetup] = React.useState(false);
  const [sort, setSort] = React.useState<CitySiteSort>("host");
  const [dateRange, setDateRange] =
    React.useState<CitySiteDateRange>("last_28_days");

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
      // Only the hostname ordering can honour a filter (see the list query),
      // so searching returns to it rather than leaving a search box that
      // appears to do nothing.
      if (searchInput.trim()) setSort("host");
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  /**
   * Search Console, on its own query rather than folded into the list.
   *
   * The registry is a local read that paints immediately; this one waits on
   * Google. Keeping them separate means the table is usable while performance
   * is still in flight, instead of every render sitting behind a round trip.
   */
  const performanceQuery = useQuery({
    queryKey: ["citySitePerformance", projectId, dateRange],
    queryFn: () => getCitySitePerformance({ data: { projectId, dateRange } }),
    placeholderData: keepPreviousData,
  });

  const performance = performanceQuery.data;
  const performanceConnected = performance?.connected === true;
  const rankedHosts = React.useMemo(
    () => (performance?.connected ? performance.hosts : []),
    [performance],
  );
  const performanceByHost = React.useMemo(
    () => new Map(rankedHosts.map((host) => [host.host, host])),
    [rankedHosts],
  );

  // Ranked mode pages over the Search Console ordering, which D1 cannot
  // produce — so the client slices the ranked host list and asks for exactly
  // those rows. Falls back to no filter in host mode.
  const isRanked = sort === "clicks" && performanceConnected;
  const rankedSlice = React.useMemo(
    () =>
      isRanked
        ? rankedHosts
            .slice((page - 1) * pageSize, page * pageSize)
            .map((host) => host.host)
        : undefined,
    [isRanked, rankedHosts, page, pageSize],
  );

  const listQuery = useQuery({
    queryKey: [
      "citySites",
      projectId,
      { search, status, page, pageSize, hosts: rankedSlice },
    ],
    queryFn: () =>
      getCitySites({
        data: {
          projectId,
          // Ranked mode sends no search or status filter, and the notice above
          // the table says so. Applying one on top of a client-built slice
          // would silently return short pages against a total computed from
          // the unfiltered ranking — a filter that appears to work and does
          // not. Changing either filter switches back to Hostname instead.
          search: isRanked ? undefined : search.trim() || undefined,
          matchStatus: isRanked ? undefined : (status ?? undefined),
          hosts: rankedSlice,
          // A ranked page is already the exact row set; asking for page 2 of it
          // would return nothing.
          page: isRanked ? 1 : page,
          pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const counts = listQuery.data?.counts;
  const registryTotal = counts
    ? counts.matched + counts.ambiguous + counts.unmatched
    : 0;

  // In ranked mode the server returns the slice in host order, so restore the
  // Search Console ordering the slice was built from.
  const rows = React.useMemo(() => {
    const fetched = listQuery.data?.rows ?? [];
    if (!rankedSlice) return fetched;
    const byHost = new Map(fetched.map((row) => [row.host, row]));
    return rankedSlice
      .map((host) => byHost.get(host))
      .filter((row): row is CitySiteRow => row !== undefined);
  }, [listQuery.data, rankedSlice]);

  const totalCount = isRanked
    ? rankedHosts.length
    : (listQuery.data?.totalCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // A selection is only meaningful for rows still on screen; changing the
  // filter or page would otherwise leave invisible rows staged for deletion.
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [search, status, page, pageSize, sort]);

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
                setSort("host");
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
                  // Same reason as the search box: the ranked ordering cannot
                  // apply a status filter, so selecting one returns to the
                  // ordering that can.
                  setSort("host");
                }}
              />
            ))}
          </div>
        ) : null}

        <SearchConsoleSummary
          performance={performance}
          registryTotal={registryTotal}
          loading={performanceQuery.isLoading}
          dateRange={dateRange}
          onDateRangeChange={(next) => {
            setDateRange(next);
            setPage(1);
          }}
        />

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

            {performanceConnected ? (
              <label className="flex items-center gap-2 text-sm text-base-content/70">
                <span className="whitespace-nowrap">Sort</span>
                <select
                  className="select select-bordered select-sm"
                  value={sort}
                  onChange={(event) => {
                    setSort(
                      event.target.value === "clicks" ? "clicks" : "host",
                    );
                    setPage(1);
                  }}
                >
                  <option value="host">Hostname</option>
                  <option value="clicks">Clicks</option>
                </select>
              </label>
            ) : null}

            {listQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin text-base-content/40" />
            ) : null}
          </div>

          {isRanked ? (
            <div className="border-b border-base-300 bg-base-200/40 px-4 py-2 text-xs text-base-content/60">
              Ranked by clicks, so this lists only the{" "}
              {rankedHosts.length.toLocaleString()} of{" "}
              {registryTotal.toLocaleString()} city sites Search Console
              reported in this period. Search and status filters do not apply to
              this ordering — switch to Hostname to use them.
            </div>
          ) : null}

          {isEmptyRegistry ? (
            <EmptyState onImport={() => setShowImport(true)} />
          ) : totalCount === 0 && !listQuery.isLoading ? (
            <div className="px-4 py-12 text-center text-sm text-base-content/50">
              No city sites match this filter.
            </div>
          ) : (
            <CitySitesTable
              rows={rows}
              performanceByHost={performanceByHost}
              performanceConnected={performanceConnected}
              selectedIds={selectedIds}
              onToggle={toggleRow}
              onToggleAll={toggleAll}
              onFix={setFixTarget}
            />
          )}

          {totalCount > 0 ? (
            <CitySitesPagination
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          ) : null}
        </div>

        {selectedIds.size > 0 ? (
          <CitySitesBulkBar
            selectedCount={selectedIds.size}
            removing={removeMutation.isPending}
            onClear={() => setSelectedIds(new Set())}
            onTrackRanks={() => setShowRankSetup(true)}
            onRemove={() => removeMutation.mutate([...selectedIds])}
          />
        ) : null}

        {showImport ? (
          <CitySiteImportModal
            projectId={projectId}
            onClose={() => setShowImport(false)}
          />
        ) : null}

        {showRankSetup ? (
          <CityRankTrackingModal
            projectId={projectId}
            citySiteIds={[...selectedIds]}
            onClose={() => setShowRankSetup(false)}
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
