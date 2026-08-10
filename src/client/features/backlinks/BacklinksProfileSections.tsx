import {
  Activity,
  ArrowDown,
  Check,
  Globe,
  LayoutTemplate,
  Link2,
  MousePointerClick,
  Server,
  Wrench,
} from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";
import { InsightIcon } from "@/client/components/InsightTile";
import {
  CATEGORY_FILTER_LABELS,
  formatCategoryValue,
  isSelectableCategoryValue,
  type CategoryFilterField,
} from "./backlinksCategoryFilters";
import type { BacklinksTabFilterValues } from "./backlinksFilterTypes";
import type { BacklinksOverviewResult } from "@/types/schemas/backlinks-results";
import { computeLinkVelocity } from "./linkVelocity";
import {
  countLinksAtStake,
  findReclaimTargets,
  type ReclaimTarget,
} from "./brokenPageReclaim";
import type { BacklinksTopPagesData } from "./backlinksPageTypes";

/**
 * Three reads on the link profile that the underlying calls already paid for
 * but nothing surfaced: where links come from, whether the profile is growing,
 * and which dead pages are still holding links.
 */

const RECLAIM_LIMIT = 8;
const COUNTS_NOTE_ID = "backlinks-breakdown-counts-note";

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const ROW_BAR = "h-1 w-full overflow-hidden rounded-full bg-base-200";

function BreakdownRowBody({
  label,
  value,
  share,
  muted,
  trailing,
}: {
  label: string;
  value: number;
  share: number;
  muted: boolean;
  trailing: React.ReactNode;
}) {
  return (
    <>
      <div className="flex w-full min-w-0 items-baseline gap-2 text-sm">
        <span className={`min-w-0 flex-1 truncate ${muted ? "" : "text-left"}`}>
          {label}
        </span>
        <span
          className={`shrink-0 tabular-nums ${muted ? "text-base-content/45" : "text-base-content/60"}`}
        >
          {formatNumber(value)}
        </span>
        {trailing}
      </div>
      {/* The count already carries this, so the bar is decoration. */}
      <div className={ROW_BAR} aria-hidden="true">
        <div
          className={`h-full rounded-full ${muted ? "bg-base-300" : "bg-primary/60 group-hover:bg-primary/80 group-focus-visible:bg-primary/80"}`}
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
      </div>
    </>
  );
}

function BreakdownList({
  title,
  icon,
  rows,
  field,
  activeValue,
  onSelect,
}: {
  title: string;
  icon: typeof Globe;
  rows: Array<{ label: string; value: number }>;
  field: CategoryFilterField;
  activeValue: string;
  /** Absent while there is no link list to filter (e.g. a restored run). */
  onSelect?: (field: CategoryFilterField, rawValue: string) => void;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.value));
  const anySelectable =
    onSelect != null &&
    rows.some((row) => isSelectableCategoryValue(row.label));

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={icon} />
          {title}
        </h3>
        {onSelect != null && !anySelectable ? (
          <p className="text-xs text-base-content/50">Summary only</p>
        ) : null}
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const display = formatCategoryValue(field, row.label);
            const share = row.value / max;
            const selectable =
              onSelect != null && isSelectableCategoryValue(row.label);

            // A row with no value to send is plain content, not a disabled
            // button: it can never become actionable, so it stays out of the
            // tab order rather than presenting itself as broken.
            if (!selectable) {
              return (
                <li
                  key={row.label}
                  className="cursor-default space-y-0.5 px-2 py-1 text-base-content/55"
                >
                  <BreakdownRowBody
                    label={display}
                    value={row.value}
                    share={share}
                    muted
                    trailing={null}
                  />
                </li>
              );
            }

            const raw = row.label.trim();
            const applied = activeValue === raw;
            return (
              <li key={row.label}>
                <Button
                  variant="ghost"
                  size="sm"
                  // Applied is a filter toggle, not the current page, so
                  // aria-pressed: a drill-down can be applied while the user
                  // reads a different sub-tab entirely.
                  aria-pressed={applied}
                  aria-label={`Show All links for ${CATEGORY_FILTER_LABELS[field]}: ${display}. Summary count: ${formatNumber(row.value)}.`}
                  onClick={() => onSelect(field, raw)}
                  className={`group h-auto min-h-9 w-full touch-manipulation flex-col items-stretch gap-0.5 rounded-md px-2 py-1 text-left font-normal hover:bg-base-200/70 active:bg-base-200 motion-reduce:transition-none ${applied ? "bg-base-200/60" : ""}`}
                >
                  <BreakdownRowBody
                    label={display}
                    value={row.value}
                    share={share}
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
      </div>
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
    <div className="space-y-2">
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
      <div
        className="grid gap-3 md:grid-cols-3"
        aria-describedby={COUNTS_NOTE_ID}
      >
        <BreakdownList
          title="Top countries"
          icon={Globe}
          rows={summary.referringCountries}
          field="sourceCountry"
          activeValue={categoryValues.sourceCountry}
          onSelect={onSelectCategory}
        />
        <BreakdownList
          title="Top-level domains"
          icon={Link2}
          rows={summary.referringTlds}
          field="sourceTld"
          activeValue={categoryValues.sourceTld}
          onSelect={onSelectCategory}
        />
        <BreakdownList
          title="Link types"
          icon={Link2}
          rows={summary.referringLinkTypes}
          field="itemType"
          activeValue={categoryValues.itemType}
          onSelect={onSelectCategory}
        />
        {/* Three more splits the same summary call already returned. */}
        <BreakdownList
          title="Link attributes"
          icon={MousePointerClick}
          rows={summary.referringLinkAttributes}
          field="linkAttribute"
          activeValue={categoryValues.linkAttribute}
          onSelect={onSelectCategory}
        />
        <BreakdownList
          title="Site types"
          icon={Server}
          rows={summary.referringPlatformTypes}
          field="sourcePlatformType"
          activeValue={categoryValues.sourcePlatformType}
          onSelect={onSelectCategory}
        />
        <BreakdownList
          title="Placement on page"
          icon={LayoutTemplate}
          rows={summary.referringPlacements}
          field="semanticLocation"
          activeValue={categoryValues.semanticLocation}
          onSelect={onSelectCategory}
        />
      </div>
    </div>
  );
}

export function LinkVelocityCard({
  trends,
}: {
  trends: BacklinksOverviewResult["newLostTrends"];
}) {
  const velocity = computeLinkVelocity(trends);
  if (!velocity) return null;

  const tone =
    velocity.direction === "growing"
      ? "text-success"
      : velocity.direction === "shrinking"
        ? "text-error"
        : "text-base-content/70";
  const headline =
    velocity.direction === "growing"
      ? "Gaining links"
      : velocity.direction === "shrinking"
        ? "Losing links"
        : "Holding steady";
  const sign = velocity.netPerMonth > 0 ? "+" : "";

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={Activity} />
          Link velocity
        </h3>
        <p className={`text-lg font-semibold ${tone}`}>
          {headline} ·{" "}
          <span className="tabular-nums">
            {sign}
            {formatNumber(velocity.netPerMonth, 1)}
          </span>{" "}
          <span className="text-sm font-normal text-base-content/60">
            referring domains / month
          </span>
        </p>
        <p className="text-xs text-base-content/60">
          Net of{" "}
          <span className="tabular-nums">
            {formatNumber(velocity.gainedPerMonth, 1)}
          </span>{" "}
          won against{" "}
          <span className="tabular-nums">
            {formatNumber(velocity.lostPerMonth, 1)}
          </span>{" "}
          lost each month, averaged over {velocity.months}{" "}
          {velocity.months === 1 ? "month" : "months"}.
          {velocity.latestNet != null ? (
            <>
              {" "}
              Last month was{" "}
              <span className="tabular-nums">
                {velocity.latestNet > 0 ? "+" : ""}
                {formatNumber(velocity.latestNet)}
              </span>
              .
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function BrokenLinkReclaimCard({
  topPages,
}: {
  topPages: BacklinksTopPagesData | undefined;
}) {
  // Read off the Top Pages rows already fetched; nothing here spends.
  const targets: ReclaimTarget[] = findReclaimTargets(
    topPages?.rows ?? [],
    RECLAIM_LIMIT,
  );
  if (targets.length === 0) return null;
  const atStake = countLinksAtStake(targets);

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={Wrench} />
          Broken pages worth reclaiming
        </h3>
        <p className="text-xs text-base-content/60">
          These pages still receive links but are broken.{" "}
          <span className="font-medium text-base-content/80">
            {formatNumber(atStake)}
          </span>{" "}
          {atStake === 1 ? "link is" : "links are"} recoverable by redirecting
          them — the links are already earned, so no outreach is needed.
        </p>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Page</th>
                <th className="text-right">Broken links</th>
                <th className="text-right">Total links</th>
                <th className="text-right">Ref. domains</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.page}>
                  <td className="max-w-md truncate" title={target.page}>
                    {target.page}
                  </td>
                  <td className="text-right tabular-nums font-medium">
                    {formatNumber(target.brokenBacklinks)}
                  </td>
                  <td className="text-right tabular-nums text-base-content/60">
                    {target.totalBacklinks != null
                      ? formatNumber(target.totalBacklinks)
                      : "—"}
                  </td>
                  <td className="text-right tabular-nums text-base-content/60">
                    {target.referringDomains != null
                      ? formatNumber(target.referringDomains)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
