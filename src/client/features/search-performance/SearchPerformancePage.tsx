import { useEffect, useState } from "react";
import {
  keepPreviousData,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  resolveQueryState,
  type QuerySamplingEvidence,
} from "@/client/components/state/queryState";
import { QueryStateBoundary } from "@/client/components/state/QueryStateBoundary";
import { TablePagination } from "@/client/components/table/TablePagination";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import {
  ALL,
  SearchPerformanceFilters,
  type DeviceFilter,
} from "@/client/features/search-performance/SearchPerformanceFilters";
import { SearchPerformanceLoadingState } from "@/client/features/search-performance/SearchPerformanceLoadingState";
import {
  DimensionTable,
  exportDimensionRows,
  exportStriking,
  StrikingDistanceTable,
  TotalsCards,
  type ExportTarget,
  type Tab,
} from "@/client/features/search-performance/SearchPerformanceParts";
import { CtrOpportunitiesTable } from "@/client/features/search-performance/CtrOpportunitiesTable";
import { BrandedSplitCard } from "@/client/features/search-performance/BrandedSplitCard";
import { ContentPerformanceTab } from "@/client/features/search-performance/ContentPerformanceTab";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  exportSearchPerformanceTable,
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";
import {
  SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  SEARCH_PERFORMANCE_PAGE_SIZES,
  type SearchPerformanceDateRange,
  type SearchPerformanceDevice,
  type SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";
import { AppPageShell } from "@/client/components/AppPageShell";
import { TableSkeleton } from "@/client/components/TableSkeleton";
import { Tabs } from "@cloudflare/kumo/components/tabs";

/** The tab set, declared once so the strip and its value resolver agree. */
const SEARCH_PERFORMANCE_TABS: ReadonlyArray<{ value: Tab }> = [
  { value: "striking" },
  { value: "ctr" },
  { value: "content" },
  { value: "queries" },
  { value: "pages" },
];

function tabDimension(tab: Tab): SearchPerformanceTableDimension {
  return tab === "pages" ? "page" : "query";
}

type FilterInput = {
  dateRange: SearchPerformanceDateRange;
  device?: SearchPerformanceDevice;
  country?: string;
};

// The server filter payload: drop device/country when set to the "ALL" sentinel.
function buildFilterInput(
  range: SearchPerformanceDateRange,
  device: DeviceFilter,
  country: string,
): FilterInput {
  return {
    dateRange: range,
    ...(device === ALL ? {} : { device }),
    ...(country === ALL ? {} : { country }),
  };
}

// Single source for the paginated table query, shared by the live query and the
// warm-on-connect prefetch so their key + fn can never drift apart.
function tableQueryOptions(
  projectId: string,
  dimension: SearchPerformanceTableDimension,
  page: number,
  pageSize: number,
  filterInput: FilterInput,
) {
  return queryOptions({
    queryKey: [
      "searchPerformanceTable",
      projectId,
      dimension,
      page,
      pageSize,
      filterInput,
    ],
    queryFn: () =>
      getSearchPerformanceTable({
        data: { projectId, dimension, page, pageSize, ...filterInput },
      }),
  });
}

/**
 * Completeness evidence for the one pull that feeds striking distance and CTR
 * opportunities.
 *
 * Both are derived from `report.queryPages`, so both stand or fall on the same
 * pull, and both must name it identically — the boundary de-duplicates its
 * notices by `label`.
 */
function queryPageEvidence(report: {
  sampling: { queryPages: { truncated: boolean; rowsExamined: number } };
}): readonly QuerySamplingEvidence[] {
  return [
    {
      label: "The Search Console query-and-page pull",
      truncated: report.sampling.queryPages.truncated,
      rowsExamined: report.sampling.queryPages.rowsExamined,
    },
  ];
}

export function SearchPerformancePage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [range, setRange] =
    useState<SearchPerformanceDateRange>("last_28_days");
  const [device, setDevice] = useState<DeviceFilter>(ALL);
  const [country, setCountry] = useState<string>(ALL);
  const [tab, setTab] = useState<Tab>("striking");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(
    SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  );

  // Any change to the query set (tab, filters, page size) restarts at page 1.
  useEffect(() => {
    setPage(1);
  }, [tab, range, device, country, pageSize]);

  const filterInput = buildFilterInput(range, device, country);

  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, range, device, country],
    queryFn: () =>
      getSearchPerformanceReport({ data: { projectId, ...filterInput } }),
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data;
  // Distinguishes "never connected" from "connected but Google refused the
  // read" so the card below can't show a green pill over an empty page.
  const accessFailureReason =
    report && !report.connected ? report.reason : undefined;

  const isTableTab = tab === "queries" || tab === "pages";
  const dimension = tabDimension(tab);
  const tableQuery = useQuery({
    ...tableQueryOptions(projectId, dimension, page, pageSize, filterInput),
    enabled: report?.connected === true && isTableTab,
    placeholderData: keepPreviousData,
  });
  const tableData = tableQuery.data;
  const tableRows = tableData?.connected ? tableData.rows : [];
  const hasNextPage = tableData?.connected ? tableData.hasNextPage : false;

  const reportState = resolveQueryState({
    isPending: reportQuery.isPending,
    isError: reportQuery.isError,
    connected: report?.connected,
    // The report itself is one object, not a row set: "connected" is the whole
    // of it being present. Zero clicks in the period is a valid report, not an
    // empty one, so metric totals must not be counted here.
    rowCount: report?.connected ? 1 : 0,
  });

  const tableState = resolveQueryState({
    isPending: tableQuery.isPending,
    isError: tableQuery.isError,
    connected: tableData?.connected,
    rowCount: tableRows.length,
    // A paginated pull is a WINDOW, not a capped read: rows past this page stay
    // reachable through the control below it, so hitting the page size is a page
    // boundary rather than a truncation. That is what makes a zero-row page a
    // real absence here, where the same zero on the striking-distance tab is
    // not -- that pull is capped and its tail is unreadable.
    sampling: [
      {
        label: `The Search Console ${dimension} pull`,
        truncated: false,
        rowsExamined: tableRows.length,
      },
    ],
  });

  // Warm the Queries tab (first page) as soon as the report connects so the tab
  // opens instantly instead of showing a spinner. Free first-party GSC data.
  useEffect(() => {
    if (report?.connected !== true) return;
    void queryClient.prefetchQuery(
      tableQueryOptions(
        projectId,
        "query",
        1,
        SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
        buildFilterInput(range, device, country),
      ),
    );
  }, [report?.connected, projectId, range, device, country, queryClient]);

  const handleExport = async (target: ExportTarget) => {
    if (!report?.connected) return;
    try {
      if (tab === "striking") {
        exportStriking(report, target);
        return;
      }
      // CTR opportunities is a short, read-only list; no export needed.
      if (tab === "ctr") return;
      const data = await exportSearchPerformanceTable({
        data: { projectId, dimension, ...filterInput },
      });
      exportDimensionRows(dimension, data.rows, report.range, target);
      // The server knows the export was cut short; before this the client threw
      // that away and handed over a file that looked complete. A spreadsheet
      // outlives the screen it came from, so the warning has to reach the person
      // who exported it.
      if (data.truncated) {
        toast.warning(
          `Exported the first ${data.rowsExamined.toLocaleString()} ${dimension} rows by clicks. Search Console caps the pull, so lower-click rows are not in this file.`,
        );
      }
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "Export failed"));
    }
  };

  return (
    <AppPageShell>
      <div>
        <h1 className="text-2xl font-semibold">Search Performance</h1>
        <p className="text-sm text-base-content/70">
          See your site&apos;s clicks, impressions, CTR, and position from
          Google Search Console.
        </p>
      </div>

      <QueryStateBoundary
        state={reportState}
        loading={<SearchPerformanceLoadingState />}
        errorMessage={getStandardErrorMessage(reportQuery.error)}
        notConnected={
          <div className="max-w-2xl">
            <SearchConsoleConnectionCard
              projectId={projectId}
              failureReason={accessFailureReason}
            />
          </div>
        }
        // Reachable only if the report resolves without an error and without
        // telling us whether it connected. Nothing was read, so nothing about
        // the property can be claimed.
        emptyTitle="No report came back"
        emptyBody="Search Console answered without data for this range. Try a different date range, or retry in a moment."
      >
        {report?.connected ? (
          <>
            <TotalsCards report={report} />
            <BrandedSplitCard
              projectId={projectId}
              queryTotals={report.queryTotals}
            />
            <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
              <div className="flex flex-col gap-3 border-b border-base-300 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <Tabs
                  variant="underline"
                  value={tab}
                  onValueChange={(next) => {
                    // Resolve against the declared list rather than asserting:
                    // recovers `Tab` from Kumo's plain string, and ignores any
                    // value that is not one of ours.
                    const selected = SEARCH_PERFORMANCE_TABS.find(
                      (t) => t.value === next,
                    );
                    if (selected) setTab(selected.value);
                  }}
                  tabs={[
                    {
                      value: "striking",
                      label: `Striking distance (${report.strikingDistance.length})`,
                    },
                    {
                      value: "ctr",
                      label: `CTR opportunities (${report.ctrOpportunities.length})`,
                    },
                    { value: "content", label: "Content" },
                    { value: "queries", label: "Queries" },
                    { value: "pages", label: "Pages" },
                  ]}
                />
                <SearchPerformanceFilters
                  device={device}
                  onDeviceChange={setDevice}
                  country={country}
                  onCountryChange={setCountry}
                  countryKeys={report.countries.map((row) => row.key)}
                  range={range}
                  onRangeChange={setRange}
                  refreshing={reportQuery.isFetching && !reportQuery.isPending}
                  onExport={(target) => void handleExport(target)}
                />
              </div>

              {/* No panel-wide sampling notice. There used to be one here, but
                  it described `report.sampling.queryPages` while sitting above
                  every tab -- including Queries and Pages, which are served by a
                  different request entirely. A completeness caveat attached to
                  data it does not describe is worse than none, so each tab now
                  carries the evidence for its own pull. */}

              {tab === "striking" ? (
                <StrikingDistanceTable
                  projectId={projectId}
                  rows={report.strikingDistance}
                  sampling={queryPageEvidence(report)}
                />
              ) : tab === "ctr" ? (
                <CtrOpportunitiesTable
                  rows={report.ctrOpportunities}
                  sampling={queryPageEvidence(report)}
                />
              ) : tab === "content" ? (
                <ContentPerformanceTab
                  projectId={projectId}
                  dateRange={range}
                  device={device === ALL ? undefined : device}
                  country={country === ALL ? undefined : country}
                />
              ) : (
                <QueryStateBoundary
                  state={tableState}
                  loading={<TableSkeleton rows={10} columns={5} />}
                  errorMessage={getStandardErrorMessage(tableQuery.error)}
                  // Access can be revoked between the report call and this one.
                  // Before, that rendered as "no data for this period", which
                  // reports an absence caused by never having read anything.
                  notConnected={
                    <p className="p-6 text-sm text-base-content/60">
                      Search Console stopped answering for this property, so
                      these rows could not be read. Reconnect from the banner
                      above.
                    </p>
                  }
                  emptyTitle={`No ${tab === "queries" ? "queries" : "pages"} for this period`}
                  emptyBody="Search Console data trails live traffic by two to three days, so a very recent range can be empty while the site is fine."
                >
                  <div className="p-4">
                    <DimensionTable
                      rows={tableRows}
                      keyLabel={tab === "queries" ? "Query" : "Page"}
                    />
                  </div>
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
                    totalCount={null}
                    hasNextPage={hasNextPage}
                    isLoading={tableQuery.isFetching}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </QueryStateBoundary>
              )}
            </div>
          </>
        ) : null}
      </QueryStateBoundary>
    </AppPageShell>
  );
}
