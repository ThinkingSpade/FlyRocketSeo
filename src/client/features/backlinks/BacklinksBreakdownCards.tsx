import {
  ArrowDown,
  Check,
  Globe,
  LayoutTemplate,
  Link2,
  MousePointerClick,
  Server,
} from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";
import { Grid } from "@cloudflare/kumo/components/grid";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Meter } from "@cloudflare/kumo/components/meter";
import { InsightIcon } from "@/client/components/InsightTile";
import {
  breakdownRowElementId,
  CATEGORY_FILTER_LABELS,
  prepareBreakdownPresentation,
  type CategoryFilterField,
} from "./backlinksCategoryFilters";
import type { BacklinksTabFilterValues } from "./backlinksFilterTypes";
import type { BacklinksOverviewResult } from "@/types/schemas/backlinks-results";
import { formatBreakdownNumber as formatNumber } from "./backlinksProfileFormat";

/**
 * The six splits of the link profile the summary call already returned:
 * where links come from, what kind they are, and where they sit on the page.
 * Split out of BacklinksProfileSections to keep both files under the repo's
 * line limit.
 */

const COUNTS_NOTE_ID = "backlinks-breakdown-counts-note";

function BreakdownRowBody({
  label,
  value,
  max,
  muted,
  trailing,
}: {
  label: string;
  value: number;
  max: number | null;
  muted: boolean;
  trailing: React.ReactNode;
}) {
  if (max != null) {
    return (
      <div className="flex w-full min-w-0 items-start gap-2">
        <Meter
          label={label}
          value={value}
          max={max}
          customValue={formatNumber(value)}
          aria-hidden={muted ? undefined : true}
          aria-valuetext={`${formatNumber(value)} backlinks`}
          className="min-w-0 flex-1 gap-0.5"
          trackClassName="h-1 bg-base-200"
          indicatorClassName={
            muted
              ? "from-base-300 via-base-300 to-base-300"
              : "from-primary/60 via-primary/60 to-primary/60 group-hover:from-primary/80 group-hover:via-primary/80 group-hover:to-primary/80 group-focus-visible:from-primary/80 group-focus-visible:via-primary/80 group-focus-visible:to-primary/80"
          }
        />
        <span className="mt-0.5 shrink-0">{trailing}</span>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 items-baseline gap-2 text-sm">
      <span className={`min-w-0 flex-1 ${muted ? "" : "text-left"}`}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${muted ? "text-base-content/45" : "text-base-content/60"}`}
      >
        {formatNumber(value)}
      </span>
      {trailing}
    </div>
  );
}

function BreakdownList({
  title,
  icon,
  rows,
  field,
  totalBacklinks,
  activeValue,
  onSelect,
}: {
  title: string;
  icon: typeof Globe;
  rows: Array<{ label: string; value: number }>;
  field: CategoryFilterField;
  totalBacklinks: number | null;
  activeValue: string;
  /** Absent while there is no link list to filter (e.g. a restored run). */
  onSelect?: (field: CategoryFilterField, rawValue: string) => void;
}) {
  if (rows.length === 0) return null;
  const presentation = prepareBreakdownPresentation(
    field,
    rows,
    totalBacklinks,
  );
  const anySelectable = onSelect != null && presentation.rows.length > 0;

  return (
    <div className="min-w-0 space-y-2 text-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <InsightIcon icon={icon} />
        {title}
      </h3>
      {onSelect != null && !anySelectable ? (
        <p className="text-xs text-base-content/50">Summary only</p>
      ) : null}
      {presentation.notice ? (
        <p className="text-xs leading-relaxed text-base-content/55">
          {presentation.notice}
        </p>
      ) : null}
      {presentation.mode === "not-provided" ? (
        <p className="text-xs leading-relaxed text-base-content/55">
          {presentation.sentence}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {presentation.rows.map((row, index) => {
            const selectable = onSelect != null;
            const label =
              presentation.mode === "sentence"
                ? (presentation.sentence ?? row.displayLabel)
                : row.displayLabel;

            // A row is plain content while there is no results list to filter.
            // It stays out of the tab order instead of posing as a disabled
            // action on restored results.
            if (!selectable) {
              return (
                <li
                  key={`${row.label}:${index}`}
                  className="cursor-default space-y-0.5 px-2 py-1 text-base-content/55"
                >
                  <BreakdownRowBody
                    label={label}
                    value={row.value}
                    max={presentation.max}
                    muted
                    trailing={null}
                  />
                </li>
              );
            }

            const raw = row.normalizedLabel;
            const applied = activeValue === raw;
            return (
              <li key={`${row.label}:${index}`}>
                <Button
                  id={breakdownRowElementId(field, raw)}
                  variant="ghost"
                  size="sm"
                  // Applied is a filter toggle, not the current page, so
                  // aria-pressed: a drill-down can be applied while the user
                  // reads a different sub-tab entirely.
                  aria-pressed={applied}
                  aria-label={`Show All links for ${CATEGORY_FILTER_LABELS[field]}: ${row.displayLabel}. Summary count: ${formatNumber(row.value)}.`}
                  onClick={() => onSelect(field, raw)}
                  className={`group h-auto min-h-9 w-full touch-manipulation flex-col items-stretch gap-0.5 rounded-md px-2 py-1 text-left font-normal hover:bg-base-200/70 active:bg-base-200 motion-reduce:transition-none ${applied ? "bg-base-200/60" : ""}`}
                >
                  <BreakdownRowBody
                    label={label}
                    value={row.value}
                    max={presentation.max}
                    muted={false}
                    trailing={
                      applied ? (
                        <Check className="size-3.5 shrink-0 text-base-content/60" />
                      ) : (
                        // Always faintly visible: touch devices never hover.
                        <ArrowDown className="size-3.5 shrink-0 text-base-content/35 group-hover:text-base-content/60 group-focus-visible:text-base-content/60" />
                      )
                    }
                  />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function BacklinksProfileBreakdowns({
  summary,
  categoryValues,
  onSelectCategory,
}: {
  summary: BacklinksOverviewResult["summary"];
  categoryValues: Pick<BacklinksTabFilterValues, CategoryFilterField>;
  /** Absent when there is no link list to filter, e.g. on a restored run. */
  onSelectCategory?: (field: CategoryFilterField, rawValue: string) => void;
}) {
  const hasAny =
    summary.referringCountries.length > 0 ||
    summary.referringTlds.length > 0 ||
    summary.referringLinkTypes.length > 0 ||
    summary.referringLinkAttributes.length > 0 ||
    summary.referringPlatformTypes.length > 0 ||
    summary.referringPlacements.length > 0;
  if (!hasAny) return null;

  return (
    <LayerCard className="space-y-3 p-4">
      {/* Says both things that could otherwise mislead: that a click spends,
          and that these counts come from a different measurement than the
          table's, so they will not always agree. */}
      <p
        id={COUNTS_NOTE_ID}
        className="text-xs leading-relaxed text-base-content/55"
      >
        {onSelectCategory
          ? "Selectable rows filter All links; each selection runs a fresh lookup. Summary counts cover the whole profile and are measured separately from the table, so totals can differ."
          : "Load individual links to use breakdown filters."}
      </p>
      <Grid variant="3up" gap="sm" aria-describedby={COUNTS_NOTE_ID}>
        <BreakdownList
          title="Top countries"
          icon={Globe}
          rows={summary.referringCountries}
          field="sourceCountry"
          totalBacklinks={summary.backlinks}
          activeValue={categoryValues.sourceCountry}
          onSelect={onSelectCategory}
        />
        <BreakdownList
          title="Top-level domains"
          icon={Link2}
          rows={summary.referringTlds}
          field="sourceTld"
          totalBacklinks={summary.backlinks}
          activeValue={categoryValues.sourceTld}
          onSelect={onSelectCategory}
        />
        <BreakdownList
          title="Link types"
          icon={Link2}
          rows={summary.referringLinkTypes}
          field="itemType"
          totalBacklinks={summary.backlinks}
          activeValue={categoryValues.itemType}
          onSelect={onSelectCategory}
        />
        {/* Three more splits the same summary call already returned. */}
        <BreakdownList
          title="Link attributes"
          icon={MousePointerClick}
          rows={summary.referringLinkAttributes}
          field="linkAttribute"
          totalBacklinks={summary.backlinks}
          activeValue={categoryValues.linkAttribute}
          onSelect={onSelectCategory}
        />
        <BreakdownList
          title="Site types"
          icon={Server}
          rows={summary.referringPlatformTypes}
          field="sourcePlatformType"
          totalBacklinks={summary.backlinks}
          activeValue={categoryValues.sourcePlatformType}
          onSelect={onSelectCategory}
        />
        <BreakdownList
          title="Placement on page"
          icon={LayoutTemplate}
          rows={summary.referringPlacements}
          field="semanticLocation"
          totalBacklinks={summary.backlinks}
          activeValue={categoryValues.semanticLocation}
          onSelect={onSelectCategory}
        />
      </Grid>
    </LayerCard>
  );
}
