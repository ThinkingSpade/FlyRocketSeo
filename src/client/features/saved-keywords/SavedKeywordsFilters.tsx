import { SlidersHorizontal, UserMinus } from "@phosphor-icons/react";
import { SavedKeywordsFilterPanel } from "./SavedKeywordsFilterPanel";
import { SavedKeywordsTagFilter } from "./SavedKeywordsTagFilter";
import type { TagColorKey } from "@/shared/tag-colors";
import type { SavedKeywordTagSummary } from "@/types/keywords";
import type { SavedKeywordsFilterForm } from "./useSavedKeywordsFilters";
import { Button } from "@cloudflare/kumo/components/button";
import { Badge } from "@cloudflare/kumo/components/badge";

export function SavedKeywordsFilters({
  filtersForm,
  activeFilterCount,
  showFilters,
  onToggleFilters,
  onResetAllFilters,
  hideWrongFit,
  onToggleWrongFit,
  wrongFitCount,
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
  hideWrongFit: boolean;
  onToggleWrongFit: () => void;
  /** Wrong-fit rows on the CURRENT page -- saved keywords are paginated
   *  server-side and the server has no fit verdict, so this control filters
   *  what is in hand. Zero hides the control entirely. */
  wrongFitCount: number;
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
        <div className="flex flex-wrap items-center gap-2">
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
              <Badge
                variant="primary"
                className="border-0 text-primary-content"
              >
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
          {wrongFitCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant={hideWrongFit ? "secondary" : "ghost"}
              aria-pressed={hideWrongFit}
              onClick={onToggleWrongFit}
              title={
                hideWrongFit
                  ? "Show saved keywords aimed at a different customer again"
                  : "Hide saved keywords your business profile says aren't for your customer (this page)"
              }
            >
              <UserMinus className="size-3.5 text-base-content/60" />
              {hideWrongFit ? "Wrong-fit hidden" : "Hide wrong-fit"}
              <span className="text-base-content/50 tabular-nums">
                {wrongFitCount}
              </span>
            </Button>
          ) : null}
        </div>
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
