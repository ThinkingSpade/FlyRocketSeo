import { useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import {
  ChevronDown,
  Download,
  FileDown,
  LineChart,
  RotateCcw,
  Save,
  Sheet,
  SlidersHorizontal,
  Sparkles,
  UserX,
} from "lucide-react";
import {
  downloadKeywordResearchCsv,
  KEYWORD_RESEARCH_HEADERS,
  keywordResearchExportRow,
} from "@/client/features/keywords/state/keywordControllerActions";
import { computeKeywordTotals } from "@/client/features/keywords/keywordGroups";
import { formatCompactNumber } from "@/client/features/keywords/utils";
import { KeywordGroupsRail } from "./KeywordGroupsRail";
import { FitRefinementButton } from "./FitRefinementButton";
import { copyKeywordsAsMarkdown } from "@/client/features/keywords/state/keywordsMarkdown";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import { OverviewStats } from "@/client/features/keywords/components";
import type { KeywordResearchControllerState } from "./types";
import { DesktopFilterFields } from "./keywordResearchDesktopFilters";
import { KeywordResearchDesktopTable } from "./KeywordResearchDesktopTable";
import { KeywordResearchDesktopSerpPanel } from "./KeywordResearchDesktopSerpPanel";
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
import { geoMetricSuffix } from "@/client/features/geo/geoMetricLabel";
import { DifficultyOverviewControl } from "@/client/features/keywords/DifficultyOverviewControl";
import { useKeywordResearchDifficultyBackfill } from "@/client/features/keywords/hooks/useKeywordResearchDifficultyBackfill";
import { Button } from "@cloudflare/kumo/components/button";

const keywordsRoute = getRouteApi("/_project/p/$projectId/keywords");

type Props = {
  controller: KeywordResearchControllerState;
  /** This project's own Ahrefs domain rating, for the per-row "needs DR X+"
   *  notes in the difficulty column below. */
  ownDomainRating: number | null;
};

export function KeywordResearchDesktopResults({
  controller,
  ownDomainRating,
}: Props) {
  return (
    <div className="flex-1 hidden md:flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden gap-4">
      <DesktopKeywordPanel
        controller={controller}
        ownDomainRating={ownDomainRating}
      />
      <KeywordResearchDesktopSerpPanel
        controller={controller}
        ownDomainRating={ownDomainRating}
      />
    </div>
  );
}

function DesktopKeywordPanel({ controller, ownDomainRating }: Props) {
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
        <DesktopTableCard
          controller={controller}
          ownDomainRating={ownDomainRating}
        />
      </div>
    </div>
  );
}

function DesktopTableCard({ controller, ownDomainRating }: Props) {
  const {
    activeFilterCount,
    filteredRows,
    researchGeo,
    rows,
    selectedRows,
    sheetsExportRows,
    showFilters,
  } = controller;
  // Muted per-metric suffix, e.g. "total vol · DFW" / "avg KD · US" -- from
  // the geo CAPTURED for this run (researchGeo), never re-derived from the
  // live scope control. Null before any search, or for a restored run
  // recorded before Defect 1's geo bundle existed -- both cases render the
  // bare label, honestly claiming no particular geography rather than
  // guessing. A restored run recorded AFTER that fix carries its own
  // bundle, so this reads its real geography instead (see
  // useKeywordResearchController.ts's own `researchGeo`).
  const volumeSuffix = researchGeo ? geoMetricSuffix(researchGeo.volume) : "";
  const difficultySuffix = researchGeo
    ? geoMetricSuffix(researchGeo.difficulty)
    : "";
  const { page, pageSize, pageRows, setPage, setPageSize } =
    useKeywordResearchPagination(filteredRows);
  const { projectId } = keywordsRoute.useParams();
  const [showTrackModal, setShowTrackModal] = useState(false);
  // Task 6's on-demand difficulty backfill, bounded to THIS page
  // (`pageRows`) -- see the hook's own header for why it never spans the
  // whole result set.
  const { mergedRows, affordance: difficultyAffordance } =
    useKeywordResearchDifficultyBackfill(projectId, pageRows, researchGeo);

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
        <Button
          size="sm"
          variant={showFilters ? "secondary" : "ghost"}
          aria-pressed={showFilters}
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
        </Button>
        <span className="text-sm text-base-content/60">
          {keywordCountLabel}
        </span>
        <FitRefinementButton controller={controller} />
        {controller.wrongFitCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant={controller.hideWrongFit ? "secondary" : "ghost"}
            aria-pressed={controller.hideWrongFit}
            onClick={() => controller.setHideWrongFit((current) => !current)}
            title={
              controller.hideWrongFit
                ? "Show keywords aimed at a different customer again"
                : "Hide keywords your business profile says aren't for your customer"
            }
          >
            <UserX className="size-3.5 text-base-content/60" />
            {controller.hideWrongFit ? "Wrong-fit hidden" : "Hide wrong-fit"}
            <span className="text-base-content/50 tabular-nums">
              {controller.wrongFitCount}
            </span>
          </Button>
        ) : null}
        {filteredRows.length > 0 ? (
          <span
            className="hidden xl:inline text-sm text-base-content/50 tabular-nums"
            title="Summed monthly volume and average difficulty of the keywords shown"
          >
            · {formatCompactNumber(totals.totalVolume)} total vol
            {volumeSuffix ? ` (${volumeSuffix})` : ""}
            {totals.averageDifficulty != null
              ? ` · avg KD ${totals.averageDifficulty}${difficultySuffix ? ` (${difficultySuffix})` : ""}`
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
      {difficultyAffordance ? (
        <div className="shrink-0 border-b border-base-300 px-4 py-2">
          <DifficultyOverviewControl
            count={difficultyAffordance.count}
            unavailableMessage={difficultyAffordance.unavailableMessage}
            isLoading={difficultyAffordance.isLoading}
            isError={difficultyAffordance.isError}
            loaded={false}
            onLoad={difficultyAffordance.onLoad}
          />
        </div>
      ) : null}
      <KeywordResearchDesktopTable
        activeFilterCount={controller.activeFilterCount}
        filteredRows={mergedRows}
        overviewKeyword={controller.overviewKeyword}
        ownDomainRating={ownDomainRating}
        researchGeo={researchGeo}
        fit={controller.fit}
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

function DesktopFilters({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  const { activeFilterCount, filtersForm } = controller;

  return (
    <div className="shrink-0 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine table results</p>
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount} active
            </span>
          ) : null}
        </div>
        <Button
          size="xs"
          variant="ghost"
          onClick={controller.resetFilters}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </Button>
      </div>

      <DesktopFilterFields form={filtersForm} />
    </div>
  );
}

/**
 * Runs the optional semantic fit pass over the rows on screen.
 *
 * Absent without an OpenRouter key or a profile to judge against, for the
 * same reason every other AI affordance here is: a button that cannot work is
 * worse than no button. The free rules verdicts are already applied by the
 * time this renders -- this only sharpens the cases a written exclusion
 * cannot reach, like "how to start a vending machine business" for an
 * operator whose profile only rules out selling.
 */
