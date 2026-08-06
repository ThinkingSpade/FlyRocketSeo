import { SlidersHorizontal } from "lucide-react";
import { SavedKeywordsFilterPanel } from "./SavedKeywordsFilterPanel";
import { SavedKeywordsTagFilter } from "./SavedKeywordsTagFilter";
import type { TagColorKey } from "@/shared/tag-colors";
import type { SavedKeywordTagSummary } from "@/types/keywords";
import type { SavedKeywordsFilterForm } from "./useSavedKeywordsFilters";
import { Button } from "@cloudflare/kumo/components/button";

export function SavedKeywordsFilters({
  filtersForm,
  activeFilterCount,
  showFilters,
  onToggleFilters,
  onResetAllFilters,
  availableTags,
  selectedTagIds,
  busyTagIds,
  onToggleTagFilter,
  onClearTagSelection,
  onUpdateTag,
  onDeleteTag,
}: {
  filtersForm: SavedKeywordsFilterForm;
  activeFilterCount: number;
  showFilters: boolean;
  onToggleFilters: () => void;
  onResetAllFilters: () => void;
  availableTags: SavedKeywordTagSummary[];
  selectedTagIds: string[];
  busyTagIds: Set<string>;
  onToggleTagFilter: (tagId: string) => void;
  onClearTagSelection: () => void;
  onUpdateTag: (input: {
    tagId: string;
    name?: string;
    color?: TagColorKey | null;
  }) => void;
  onDeleteTag: (tagId: string) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-2.5">
        <Button
          type="button"
          size="sm"
          variant={showFilters ? "secondary" : "ghost"}
          aria-pressed={showFilters}
          onClick={onToggleFilters}
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
        <SavedKeywordsTagFilter
          availableTags={availableTags}
          selectedTagIds={selectedTagIds}
          busyTagIds={busyTagIds}
          onToggleTagFilter={onToggleTagFilter}
          onClearSelection={onClearTagSelection}
          onUpdateTag={onUpdateTag}
          onDeleteTag={onDeleteTag}
        />
      </div>

      {showFilters ? (
        <SavedKeywordsFilterPanel
          form={filtersForm}
          activeFilterCount={activeFilterCount}
          onReset={onResetAllFilters}
        />
      ) : null}
    </>
  );
}
