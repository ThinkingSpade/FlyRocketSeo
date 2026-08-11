import { ArrowUpLeft, X } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";
import {
  activeCategoryFilters,
  CATEGORY_FILTER_LABELS,
  type CategoryFilterField,
} from "./backlinksCategoryFilters";
import type { BacklinksTabFilterValues } from "./backlinksFilterTypes";
import type { BreakdownOrigin } from "./useBacklinksRowsTransaction";

/**
 * The drill-downs currently narrowing the table, each removable in one click,
 * plus the way back to the card the user came from.
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
  origin,
  onClear,
  onReturn,
}: {
  values: Pick<BacklinksTabFilterValues, CategoryFilterField>;
  /** The breakdown row this drill-down started from, if any. */
  origin: BreakdownOrigin | null;
  onClear: (field: CategoryFilterField) => void;
  onReturn: () => void;
}) {
  const active = activeCategoryFilters(values);
  if (active.length === 0 && !origin) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-base-300 bg-base-200/30 px-4 py-2">
      {active.length > 0 ? (
        <>
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
              <X
                className="size-3.5 shrink-0 text-base-content/50"
                aria-hidden
              />
            </Button>
          ))}
        </>
      ) : null}
      {/* Survives clearing the chip: having followed a drill-down, the user
          still wants their reading position back. Changes no filter and issues
          no request. */}
      {origin ? (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto font-normal"
          onClick={onReturn}
        >
          <ArrowUpLeft className="size-3.5 shrink-0" aria-hidden />
          Back to {CATEGORY_FILTER_LABELS[origin.field].toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}
