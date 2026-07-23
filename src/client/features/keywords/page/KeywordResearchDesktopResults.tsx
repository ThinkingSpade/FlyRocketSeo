import { useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import {
  ChevronDown,
  Download,
  FileDown,
  Globe,
  LineChart,
  Save,
  Sheet,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  downloadKeywordResearchCsv,
  KEYWORD_RESEARCH_HEADERS,
  keywordResearchExportRow,
} from "@/client/features/keywords/state/keywordControllerActions";
import { computeKeywordTotals } from "@/client/features/keywords/keywordGroups";
import { formatCompactNumber } from "@/client/features/keywords/utils";
import { KeywordGroupsRail } from "./KeywordGroupsRail";
import { copyKeywordsAsMarkdown } from "@/client/features/keywords/state/keywordsMarkdown";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  AreaTrendChart,
  OffTopicNotice,
  OverviewStats,
  SerpAnalysisCard,
} from "@/client/features/keywords/components";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordResearchControllerState } from "./types";
import {
  DesktopFilters,
  SerpPanelActions,
} from "./keywordResearchDesktopFilters";
import { KeywordResearchDesktopTable } from "./KeywordResearchDesktopTable";
import {
  KeywordResearchPagination,
  useKeywordResearchPagination,
} from "./KeywordResearchPagination";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";
import { TrackKeywordsModal } from "@/client/features/rank-tracking/TrackKeywordsModal";
import { getLanguageCode } from "@/client/features/keywords/locations";

const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatTrendRangeLabel(trend: KeywordResearchRow["trend"]): string {
  if (trend.length === 0) return "Last 12 available months";

  const sorted = trend.toSorted(
    (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month),
  );
  const last12 = sorted.slice(-12);
  const start = last12[0];
  const end = last12[last12.length - 1];

  const toLabel = (month: number, year: number) => {
    const monthLabel = MONTH_SHORT_LABELS[month - 1] ?? `M${month}`;
    return `${monthLabel} ${year}`;
  };

  const startLabel = toLabel(start.month, start.year);
  const endLabel = toLabel(end.month, end.year);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

const keywordsRoute = getRouteApi("/_project/p/$projectId/keywords");

type Props = {
  controller: KeywordResearchControllerState;
};

export function KeywordResearchDesktopResults({ controller }: Props) {
  return (
    <div className="flex-1 hidden md:flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden gap-4">
      <DesktopKeywordPanel controller={controller} />
      <DesktopSerpPanel controller={controller} />
    </div>
  );
}

function DesktopKeywordPanel({ controller }: Props) {
  const {
    lastResultSource,
    lastUsedFallback,
    searchedKeyword,
    showApproximateMatchNotice,
  } = controller;

  return (
    <div className="order-2 xl:order-1 flex flex-col min-w-0 gap-2 xl:basis-3/5">
      {showApproximateMatchNotice ? (
        <div
          className="rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-base-content"
          role="status"
        >
          No exact match for{" "}
          <span className="font-medium">"{searchedKeyword}"</span>. Showing
          closest related keywords instead.
          {lastUsedFallback ? (
            <span className="text-base-content/75">
              {" "}
              Source: {lastResultSource} fallback.
            </span>
          ) : null}
        </div>
      ) : null}
      {controller.overviewKeyword ? (
        <OverviewStats keyword={controller.overviewKeyword} />
      ) : null}
      <div className="flex flex-1 min-h-0 gap-2">
        <KeywordGroupsRail
          groups={controller.keywordGroups}
          totalKeywords={controller.rows.length}
          groupTerm={controller.groupTerm}
          setGroupTerm={controller.setGroupTerm}
        />
        <DesktopTableCard controller={controller} />
      </div>
    </div>
  );
}

function DesktopTableCard({ controller }: Props) {
  const {
    activeFilterCount,
    filteredRows,
    rows,
    selectedRows,
    sheetsExportRows,
    showFilters,
  } = controller;
  const { page, pageSize, pageRows, setPage, setPageSize } =
    useKeywordResearchPagination(filteredRows);
  const { projectId } = keywordsRoute.useParams();
  const [showTrackModal, setShowTrackModal] = useState(false);

  const isSliced = activeFilterCount > 0 || controller.groupTerm != null;
  const keywordCountLabel =
    selectedRows.size > 0
      ? `${selectedRows.size} of ${filteredRows.length} selected`
      : isSliced
        ? `Showing ${filteredRows.length} of ${rows.length} keywords`
        : `Showing ${filteredRows.length} keywords`;
  const totals = computeKeywordTotals(filteredRows);

  const canExport = filteredRows.length > 0;
  const selectedExportRows = filteredRows
    .filter((row) => selectedRows.has(row.keyword))
    .map(keywordResearchExportRow);
  const handleExportToSheets = () => {
    void exportTableToSheets({
      headers: KEYWORD_RESEARCH_HEADERS,
      rows: sheetsExportRows,
      feature: "keyword_research",
    });
  };
  const handleExportSelectionToSheets = () => {
    void exportTableToSheets({
      headers: KEYWORD_RESEARCH_HEADERS,
      rows: selectedExportRows,
      feature: "keyword_research",
    });
  };
  const handleExportSelectionCsv = () => {
    downloadKeywordResearchCsv(selectedExportRows);
    captureClientEvent("data:export", {
      source_feature: "keyword_research",
      result_count: selectedExportRows.length,
      scope: "selection",
    });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-base-300">
        <button
          className={`btn btn-ghost btn-sm gap-1.5 ${showFilters ? "btn-active" : ""}`}
          onClick={() => controller.setShowFilters((current) => !current)}
          title="Toggle table filters"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        <span className="text-sm text-base-content/60">
          {keywordCountLabel}
        </span>
        {filteredRows.length > 0 ? (
          <span
            className="hidden xl:inline text-sm text-base-content/50 tabular-nums"
            title="Summed monthly volume and average difficulty of the keywords shown"
          >
            · {formatCompactNumber(totals.totalVolume)} total vol
            {totals.averageDifficulty != null
              ? ` · avg KD ${totals.averageDifficulty}`
              : ""}
          </span>
        ) : null}
        <div className="flex-1" />
        <div className="dropdown dropdown-end">
          <div
            tabIndex={0}
            role="button"
            className={`btn btn-ghost btn-sm gap-1 ${!canExport ? "btn-disabled" : ""}`}
          >
            <Download className="size-3.5" />
            <span className="hidden lg:inline">Export</span>
            <ChevronDown className="size-3 opacity-60" />
          </div>
          <ul
            tabIndex={0}
            className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-56"
          >
            <li>
              <button onClick={handleExportToSheets} disabled={!canExport}>
                <Sheet className="size-4" />
                Export to Sheets
              </button>
            </li>
            <li>
              <button onClick={controller.exportCsv} disabled={!canExport}>
                <FileDown className="size-4" />
                Export CSV
              </button>
            </li>
          </ul>
        </div>
      </div>

      <TableBulkActionBar
        selectedCount={selectedRows.size}
        onClear={() => controller.setSelectedRows(new Set())}
        actions={
          <div className="flex items-center px-1.5">
            <TableBulkActionButton
              icon={<Save className="size-3.5" />}
              onClick={controller.handleSaveKeywords}
            >
              Save Keywords
            </TableBulkActionButton>
            <TableBulkActionButton
              icon={<LineChart className="size-3.5" />}
              onClick={() => setShowTrackModal(true)}
            >
              Track ranks
            </TableBulkActionButton>
            <TableBulkExportMenu
              actions={[
                {
                  label: "Copy for AI",
                  icon: <Sparkles className="size-4" />,
                  onClick: () =>
                    void copyKeywordsAsMarkdown(selectedExportRows),
                },
                {
                  label: "Export to Sheets",
                  icon: <Sheet className="size-4" />,
                  onClick: handleExportSelectionToSheets,
                },
                {
                  label: "Export CSV",
                  icon: <FileDown className="size-4" />,
                  onClick: handleExportSelectionCsv,
                },
              ]}
            />
          </div>
        }
      />

      {showFilters ? <DesktopFilters controller={controller} /> : null}
      <OffTopicNotice
        count={controller.offTopicCount}
        seedKeyword={controller.searchedKeyword}
        show={controller.showOffTopic}
        onToggle={() => controller.setShowOffTopic((current) => !current)}
      />
      <KeywordResearchDesktopTable
        activeFilterCount={controller.activeFilterCount}
        filteredRows={pageRows}
        overviewKeyword={controller.overviewKeyword}
        selectedRows={controller.selectedRows}
        setSelectedRows={controller.setSelectedRows}
        sortDir={controller.sortDir}
        sortField={controller.sortField}
        toggleSort={controller.toggleSort}
        resetFilters={controller.resetFilters}
        handleRowClick={controller.handleRowClick}
      />
      {filteredRows.length > 0 ? (
        <KeywordResearchPagination
          page={page}
          pageSize={pageSize}
          totalCount={filteredRows.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      {showTrackModal ? (
        <TrackKeywordsModal
          projectId={projectId}
          keywords={[...selectedRows]}
          defaultLocationCode={controller.lastSearchLocationCode}
          defaultLanguageCode={getLanguageCode(
            controller.lastSearchLocationCode,
          )}
          onClose={() => setShowTrackModal(false)}
        />
      ) : null}
    </div>
  );
}

function DesktopSerpPanel({ controller }: Props) {
  const { projectId } = keywordsRoute.useParams();
  const { overviewKeyword } = controller;
  const trendRangeLabel = overviewKeyword
    ? formatTrendRangeLabel(overviewKeyword.trend)
    : "Last 12 available months";

  return (
    <div className="order-1 xl:order-2 flex flex-col min-w-0 gap-2 xl:basis-2/5 xl:overflow-y-auto">
      {overviewKeyword && overviewKeyword.trend.length > 0 ? (
        <div className="shrink-0 overflow-hidden border border-base-300 rounded-xl bg-base-100 px-4 py-3">
          <h4 className="text-sm font-semibold mb-1">
            Search Trends{" "}
            <span className="font-normal text-base-content/50">
              {trendRangeLabel}
            </span>
          </h4>
          <AreaTrendChart trend={overviewKeyword.trend} />
        </div>
      ) : null}

      <div className="flex flex-col overflow-hidden border border-base-300 rounded-xl bg-base-100">
        <div className="shrink-0 px-4 py-3 border-b border-base-300">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Globe className="size-3.5" />
              SERP Analysis
              {controller.activeSerpKeyword ? (
                <span className="font-normal text-base-content/50 truncate">
                  : {controller.activeSerpKeyword}
                </span>
              ) : null}
            </h3>
            {controller.activeSerpKeyword ? (
              <SerpPanelActions
                projectId={projectId}
                keyword={controller.activeSerpKeyword}
              />
            ) : null}
          </div>
        </div>
        <div className="p-4">
          <SerpAnalysisCard
            items={controller.serpResults}
            keyword={controller.activeSerpKeyword}
            loading={controller.serpLoading}
            error={controller.serpError}
            onRetry={() => void controller.serpQuery.refetch()}
            page={controller.serpPage}
            pageSize={controller.SERP_PAGE_SIZE}
            onPageChange={controller.setSerpPage}
          />
        </div>
      </div>
    </div>
  );
}
