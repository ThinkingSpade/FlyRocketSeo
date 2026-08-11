import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  OnChangeFn,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SavedKeywordsBulkActionBar } from "@/client/features/saved-keywords/SavedKeywordsBulkActionBar";
import { SavedKeywordsBulkTagsModal } from "@/client/features/saved-keywords/SavedKeywordsBulkTagsModal";
import { SavedKeywordsFilters } from "@/client/features/saved-keywords/SavedKeywordsFilters";
import { SavedKeywordsHeader } from "@/client/features/saved-keywords/SavedKeywordsHeader";
import {
  DeleteSavedKeywordsModal,
  RemoveSavedKeywordsError,
} from "@/client/features/saved-keywords/SavedKeywordsModals";
import { SavedKeywordsPagination } from "@/client/features/saved-keywords/SavedKeywordsPagination";
import { SavedKeywordsPortfolio } from "@/client/features/saved-keywords/SavedKeywordsPortfolio";
import { SavedKeywordsQueryContent } from "@/client/features/saved-keywords/SavedKeywordsQueryContent";
import { TrackKeywordsModal } from "@/client/features/rank-tracking/TrackKeywordsModal";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/client/features/keywords/locations";
import { compileSavedKeywordsFilters } from "@/client/features/saved-keywords/savedKeywordsFilterTypes";
import {
  getSavedKeywordsTrackLocation,
  toSavedKeywordSort,
  type SAVED_KEYWORD_PAGE_SIZES,
} from "@/client/features/saved-keywords/savedKeywordsUtils";
import { useSavedKeywordsExport } from "@/client/features/saved-keywords/useSavedKeywordsExport";
import { useSavedKeywordsFilters } from "@/client/features/saved-keywords/useSavedKeywordsFilters";
import { useSavedKeywordsFit } from "@/client/features/saved-keywords/useSavedKeywordsFit";
import { useSavedKeywordsMutations } from "@/client/features/saved-keywords/useSavedKeywordsMutations";
import { useTagManage } from "@/client/features/saved-keywords/useTagManage";
import { getSavedKeywords } from "@/serverFunctions/keywords";
import type { SavedKeywordTag } from "@/types/keywords";
import { AppPageShell } from "@/client/components/AppPageShell";

/**
 * `q` is the term an inbound link wants this list narrowed to. Without a
 * schema here nothing could hand Saved Keywords any context at all -- every
 * link into the tab arrived at the whole, unfiltered set and left the user to
 * retype what the sending tab already knew. It seeds the Include filter, so
 * it goes to the server with the first query rather than filtering a page
 * that was fetched without it.
 */
const savedKeywordsSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_project/p/$projectId/saved")({
  validateSearch: savedKeywordsSearchSchema,
  component: SavedKeywordsPage,
});

const FILTER_DEBOUNCE_MS = 350;

function SavedKeywordsPage() {
  const { projectId } = Route.useParams();
  const { q: initialInclude } = Route.useSearch();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof SAVED_KEYWORD_PAGE_SIZES)[number]>(50);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "fetchedAt", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showTrackModal, setShowTrackModal] = useState(false);

  const filters = useSavedKeywordsFilters(initialInclude);
  const [committedFilterValues, setCommittedFilterValues] = useState(
    filters.values,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCommittedFilterValues(filters.values);
      setPage(1);
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.values]);

  const appliedFilters = useMemo(
    () => compileSavedKeywordsFilters(committedFilterValues),
    [committedFilterValues],
  );
  const exportFilters = useMemo(
    () => compileSavedKeywordsFilters(filters.values),
    [filters.values],
  );

  const sortState = sorting[0];
  const sort = toSavedKeywordSort(sortState?.id);
  const order: "asc" | "desc" = sortState
    ? sortState.desc
      ? "desc"
      : "asc"
    : "desc";
  const tagFilterKey = selectedTagIds.join("|");

  const queryInput = useMemo(
    () => ({
      projectId,
      ...appliedFilters,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      page,
      pageSize,
      sort,
      order,
    }),
    [appliedFilters, order, page, pageSize, projectId, selectedTagIds, sort],
  );

  const savedKeywordsQuery = useQuery({
    queryKey: ["savedKeywords", projectId, queryInput],
    queryFn: () => getSavedKeywords({ data: queryInput }),
    placeholderData: keepPreviousData,
  });
  const {
    data,
    isLoading,
    isFetching,
    isError: savedKeywordsFailed,
  } = savedKeywordsQuery;

  const savedKeywords = data?.rows ?? [];
  // Free client-side verdicts over the page already fetched -- the tab showed
  // volume, CPC, competition, KD and intent, every metric except whether the
  // keyword is one this client can sell into.
  const keywordFit = useSavedKeywordsFit(projectId, savedKeywords);
  const availableTags = data?.tags ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // Includes the wrong-fit toggle so an emptied page reads as "nothing
  // matches your filters" rather than the first-run "no saved keywords yet".
  const hasActiveFilters =
    filters.activeFilterCount > 0 ||
    selectedTagIds.length > 0 ||
    keywordFit.hideWrongFit;
  // Read off the VISIBLE rows: a wrong-fit row hidden by the toggle must not
  // stay in the selection that feeds delete, export and rank tracking.
  const selectedRows = keywordFit.visibleRows.filter(
    (row) => rowSelection[row.id],
  );
  const selectedIds = selectedRows.map((row) => row.id);
  const selectedCount = selectedIds.length;

  const selectedRowTags = useMemo<SavedKeywordTag[]>(() => {
    const map = new Map<string, SavedKeywordTag>();
    for (const row of selectedRows) {
      for (const tag of row.tags) {
        if (!map.has(tag.id)) map.set(tag.id, tag);
      }
    }
    return [...map.values()].toSorted((a, b) =>
      a.normalizedName.localeCompare(b.normalizedName),
    );
  }, [selectedRows]);

  // Rank tracking pins one location per domain, so derive a single location for
  // the selection: the most common one among selected rows (ties break to the
  // first encountered), and flag when the selection spans several.
  const trackLocation = useMemo(
    () => getSavedKeywordsTrackLocation(selectedRows, DEFAULT_LOCATION_CODE),
    [selectedRows],
  );

  useEffect(() => {
    setRowSelection({});
  }, [page, pageSize, appliedFilters, tagFilterKey, sort, order]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const {
    remove: removeMutation,
    tag: tagMutation,
    refreshMetrics: refreshMetricsMutation,
  } = useSavedKeywordsMutations({
    projectId,
    onRemoved: () => {
      setRowSelection({});
      setShowConfirm(false);
      setRemoveError(null);
    },
    onRemoveFailed: setRemoveError,
    onTagged: () => {
      setRowSelection({});
      setShowTagModal(false);
    },
  });

  const tagManage = useTagManage(projectId);
  const exporter = useSavedKeywordsExport({
    projectId,
    appliedFilters: exportFilters,
    selectedTagIds,
    sort,
    order,
  });

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((current) =>
      typeof updater === "function" ? updater(current) : updater,
    );
    setPage(1);
  };

  const handleDeleteTag = async (tagId: string) => {
    const ok = await tagManage.deleteTag(tagId);
    if (ok) {
      setSelectedTagIds((current) => current.filter((id) => id !== tagId));
    }
  };

  const handleClearAllFilters = () => {
    filters.resetFilters();
    setSelectedTagIds([]);
    setPage(1);
  };

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <AppPageShell>
        <SavedKeywordsHeader
          totalCount={totalCount}
          exporting={exporter.exporting}
          metricsRefreshing={refreshMetricsMutation.isPending}
          onExportCsv={() => void exporter.exportFilteredCsv()}
          onExportSheets={() => void exporter.exportFilteredSheets()}
          onRefreshMetrics={() => refreshMetricsMutation.mutate()}
        />

        <SavedKeywordsPortfolio
          projectId={projectId}
          appliedFilters={appliedFilters}
          selectedTagIds={selectedTagIds}
          sort={sort}
          order={order}
          totalCount={totalCount}
        />

        <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
          <SavedKeywordsFilters
            filtersForm={filters.filtersForm}
            activeFilterCount={filters.activeFilterCount}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters((v) => !v)}
            onResetAllFilters={handleClearAllFilters}
            hideWrongFit={keywordFit.hideWrongFit}
            onToggleWrongFit={() => keywordFit.setHideWrongFit((v) => !v)}
            wrongFitCount={keywordFit.wrongFitCount}
            availableTags={availableTags}
            selectedTagIds={selectedTagIds}
            busyTagIds={tagManage.busyTagIds}
            onToggleTagFilter={(tagId) => {
              setSelectedTagIds((current) =>
                current.includes(tagId)
                  ? current.filter((id) => id !== tagId)
                  : [...current, tagId],
              );
              setPage(1);
            }}
            onClearTagSelection={() => {
              setSelectedTagIds([]);
              setPage(1);
            }}
            onUpdateTag={(input) => void tagManage.updateTag(input)}
            onDeleteTag={(tagId) => void handleDeleteTag(tagId)}
          />

          <div className="space-y-3 p-4">
            {removeError ? (
              <RemoveSavedKeywordsError message={removeError} />
            ) : null}
            <SavedKeywordsQueryContent
              failed={savedKeywordsFailed}
              fetching={isFetching}
              loading={isLoading}
              totalCount={totalCount}
              onRetry={() => void savedKeywordsQuery.refetch()}
              tableProps={{
                projectId,
                rows: keywordFit.visibleRows,
                rowSelection,
                sorting,
                isLoading,
                hasActiveFilters,
                fit: keywordFit.fit,
                onRowSelectionChange: setRowSelection,
                onSortingChange: handleSortingChange,
              }}
            />
          </div>

          <SavedKeywordsPagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            isLoading={isFetching}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        </div>

        <SavedKeywordsBulkActionBar
          selectedCount={selectedCount}
          exportingSelection={exporter.exportingSelection}
          onCopy={() => {
            void navigator.clipboard.writeText(
              selectedRows.map((row) => row.keyword).join("\n"),
            );
            toast.success(
              `${selectedCount} keyword${selectedCount !== 1 ? "s" : ""} copied`,
            );
          }}
          onOpenTags={() => setShowTagModal(true)}
          onTrackRanks={() => setShowTrackModal(true)}
          onExportCsv={() => exporter.exportSelectionCsv(selectedRows)}
          onExportSheets={() =>
            void exporter.exportSelectionSheets(selectedRows)
          }
          onDelete={() => setShowConfirm(true)}
          onClear={() => setRowSelection({})}
        />

        {showConfirm ? (
          <DeleteSavedKeywordsModal
            selectedCount={selectedCount}
            isPending={removeMutation.isPending}
            onClose={() => setShowConfirm(false)}
            onConfirm={() => removeMutation.mutate(selectedIds)}
          />
        ) : null}

        {showTagModal ? (
          <SavedKeywordsBulkTagsModal
            availableTags={availableTags}
            selectedCount={selectedCount}
            selectedRowTags={selectedRowTags}
            isPending={tagMutation.isPending}
            onClose={() => setShowTagModal(false)}
            onApply={({ addTags, removeTagIds }) =>
              tagMutation.mutate({
                savedKeywordIds: selectedIds,
                addTags,
                removeTagIds,
              })
            }
          />
        ) : null}

        {showTrackModal ? (
          <TrackKeywordsModal
            projectId={projectId}
            keywords={selectedRows.map((row) => row.keyword)}
            defaultLocationCode={trackLocation.locationCode}
            defaultLanguageCode={getLanguageCode(trackLocation.locationCode)}
            mixedLocations={trackLocation.mixed}
            onSuccess={() => setRowSelection({})}
            onClose={() => setShowTrackModal(false)}
          />
        ) : null}
      </AppPageShell>
    </div>
  );
}
