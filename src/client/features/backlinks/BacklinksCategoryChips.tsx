import { X } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";
import {
  activeCategoryFilters,
  type CategoryFilterField,
} from "./backlinksCategoryFilters";
import type { BacklinksTabFilterValues } from "./backlinksFilterTypes";

/**
 * The drill-downs currently narrowing the table, each removable in one click.
 *
 * These live here rather than as six more controls in the filter panel because
 * they are enumerated values arriving from the breakdown cards, not free text;
 * showing them where the filtered rows are keeps the cause next to the effect.
 *
 * Each chip is one button. A badge wrapping a nested close button would put an
 * interactive element inside another, which no assistive technology handles
 * well.
 */
export function BacklinksCategoryChips({
  values,
  onClear,
}: {
  values: Pick<BacklinksTabFilterValues, CategoryFilterField>;
  onClear: (field: CategoryFilterField) => void;
}) {
  const active = activeCategoryFilters(values);
  if (active.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-base-300 bg-base-200/30 px-4 py-2">
      <span className="text-xs font-medium text-base-content/60">
        Category filters
      </span>
      {active.map((filter) => (
        <Button
          key={filter.field}
          variant="outline"
          size="sm"
          aria-label={`Remove ${filter.chipLabel} filter`}
          onClick={() => onClear(filter.field)}
          className="max-w-full rounded-full bg-base-100 px-2.5 font-normal text-base-content hover:bg-base-200"
        >
          <span className="truncate">{filter.chipLabel}</span>
          <X className="size-3.5 shrink-0 text-base-content/50" aria-hidden />
        </Button>
      ))}
    </div>
  );
}
