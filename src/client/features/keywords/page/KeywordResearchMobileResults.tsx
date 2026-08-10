import {
  CaretDown,
  Download,
  FileArrowDown,
  ChartLine,
  FloppyDisk,
  Table,
  SlidersHorizontal,
  Sparkle,
} from "@phosphor-icons/react";
import { useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import {
  downloadKeywordResearchCsv,
  KEYWORD_RESEARCH_HEADERS,
  keywordResearchExportRow,
} from "@/client/features/keywords/state/keywordControllerActions";
import { copyKeywordsAsMarkdown } from "@/client/features/keywords/state/keywordsMarkdown";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import { SerpAnalysisCard } from "@/client/features/keywords/components";
import { KeywordResearchDesktopTable } from "./KeywordResearchDesktopTable";
import { KeywordActionPlanCard } from "@/client/features/keywords/actionPlan/KeywordActionPlanCard";
import {
  KeywordResearchPagination,
  useKeywordResearchPagination,
} from "./KeywordResearchPagination";
import type { KeywordResearchControllerState } from "./types";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";
import { TrackKeywordsModal } from "@/client/features/rank-tracking/TrackKeywordsModal";
import { getLanguageCode } from "@/client/features/keywords/locations";
import { DifficultyOverviewControl } from "@/client/features/keywords/DifficultyOverviewControl";
import { useKeywordResearchDifficultyBackfill } from "@/client/features/keywords/hooks/useKeywordResearchDifficultyBackfill";
import { MobileFilters } from "./keywordResearchMobileFilters";
import { Button } from "@cloudflare/kumo/components/button";
import { Badge } from "@cloudflare/kumo/components/badge";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";

const keywordsRoute = getRouteApi("/_project/p/$projectId/keywords");

type Props = {
  controller: KeywordResearchControllerState;
  /** This project's own Ahrefs domain rating, for the per-row "needs DR X+"
   *  notes in the difficulty column below. */
  ownDomainRating: number | null;
};

export function KeywordResearchMobileResults({
  controller,
  ownDomainRating,
}: Props) {
  const { filteredRows, mobileTab } = controller;
  const { projectId } = keywordsRoute.useParams();

  return (
    <div className="flex-1 flex flex-col overflow-hidden md:hidden">
      <div className="shrink-0 flex border-b border-base-300 bg-base-100">
        <button
          className={`flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors ${
            mobileTab === "keywords"
              ? "border-primary text-primary"
              : "border-transparent text-base-content/60"
          }`}
          onClick={() => controller.setMobileTab("keywords")}
        >
          Keywords ({filteredRows.length})
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors ${
            mobileTab === "serp"
              ? "border-primary text-primary"
              : "border-transparent text-base-content/60"
          }`}
          onClick={() => controller.setMobileTab("serp")}
        >
          SERP Analysis
        </button>
      </div>

      {mobileTab === "keywords" ? (
        <MobileKeywordResults
          controller={controller}
          ownDomainRating={ownDomainRating}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <SerpAnalysisCard
            items={controller.serpResults}
            keyword={controller.activeSerpKeyword}
            loading={controller.serpLoading}
            error={controller.serpError}
            onRetry={() => void controller.serpQuery.refetch()}
            page={controller.serpPage}
            pageSize={controller.SERP_PAGE_SIZE}
            onPageChange={controller.setSerpPage}
            analyzeKeyword={controller.overviewKeyword?.keyword ?? null}
            onAnalyze={() => {
              const target = controller.overviewKeyword;
              if (!target) return;
              controller.setSerpKeyword(target.keyword);
              controller.setSerpPage(0);
            }}
          />
          {controller.activeSerpKeyword ? (
            <KeywordActionPlanCard
              projectId={projectId}
              keyword={controller.activeSerpKeyword}
              serpResults={controller.serpResults}
              ownDomainRating={ownDomainRating}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function MobileKeywordResults({ controller, ownDomainRating }: Props) {
  const {
    activeFilterCount,
    filteredRows,
    researchGeo,
    rows,
    selectedRows,
    sheetsExportRows,
    showFilters,
  } = controller;
  const { page, pageSize, pageRows, setPage, setPageSize } =
    useKeywordResearchPagination(filteredRows);
  const { projectId } = keywordsRoute.useParams();
  const [showTrackModal, setShowTrackModal] = useState(false);
  // Task 6's on-demand difficulty backfill, bounded to THIS page -- same
  // shared hook the desktop layout uses (KeywordResearchDesktopResults.tsx),
  // not a second mechanism.
  const { mergedRows, affordance: difficultyAffordance } =
    useKeywordResearchDifficultyBackfill(projectId, pageRows, researchGeo);

  const keywordCountLabel =
    selectedRows.size > 0
      ? `${selectedRows.size} selected`
      : activeFilterCount > 0
        ? `Showing ${filteredRows.length} of ${rows.length}`
        : `Showing ${filteredRows.length} keywords`;

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
    <div className="flex-1 flex flex-col overflow-hidden">
      {controller.showApproximateMatchNotice ? (
        <div
          className="mx-4 mt-2 rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-xs text-base-content"
          role="status"
        >
          No exact match for{" "}
          <span className="font-medium">"{controller.searchedKeyword}"</span>.
          Showing closest related keywords.
        </div>
      ) : null}

      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-base-300 bg-base-100">
        <Button
          size="xs"
          variant={showFilters ? "secondary" : "ghost"}
          aria-pressed={showFilters}
          onClick={() => controller.setShowFilters((current) => !current)}
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeFilterCount > 0 ? (
            <Badge variant="primary" className="border-0 text-primary-content">
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
        <span className="text-xs text-base-content/60">
          {keywordCountLabel}
        </span>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                size="xs"
                disabled={!canExport}
                aria-label="Export"
              >
                <Download className="size-3.5" />
                <CaretDown className="size-3 opacity-60" />
              </Button>
            }
          />
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item icon={Table} onClick={handleExportToSheets}>
              Export to Sheets
            </DropdownMenu.Item>
            <DropdownMenu.Item
              icon={FileArrowDown}
              onClick={controller.exportCsv}
            >
              Export CSV
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>

      <TableBulkActionBar
        selectedCount={selectedRows.size}
        onClear={() => controller.setSelectedRows(new Set())}
        actions={
          <div className="flex items-center px-1.5">
            <TableBulkActionButton
              icon={<FloppyDisk className="size-3.5" />}
              onClick={controller.handleSaveKeywords}
            >
              Save
            </TableBulkActionButton>
            <TableBulkActionButton
              icon={<ChartLine className="size-3.5" />}
              onClick={() => setShowTrackModal(true)}
            >
              Track
            </TableBulkActionButton>
            <TableBulkExportMenu
              actions={[
                {
                  label: "Copy for AI",
                  icon: <Sparkle className="size-4" />,
                  onClick: () =>
                    void copyKeywordsAsMarkdown(selectedExportRows),
                },
                {
                  label: "Export to Sheets",
                  icon: <Table className="size-4" />,
                  onClick: handleExportSelectionToSheets,
                },
                {
                  label: "Export CSV",
                  icon: <FileArrowDown className="size-4" />,
                  onClick: handleExportSelectionCsv,
                },
              ]}
            />
          </div>
        }
      />

      {showFilters ? <MobileFilters controller={controller} /> : null}
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
        fit={controller.fit}
        researchGeo={researchGeo}
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
