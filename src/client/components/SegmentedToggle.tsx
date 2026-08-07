import type { ReactNode } from "react";
import { Tabs } from "@cloudflare/kumo/components/tabs";

interface SegmentedToggleItem<T extends string> {
  value: T;
  /** Optional. Text-only segments (a sort order, a status filter) pass none
   *  and set `showLabels`; the icon groups this started as still pass one. */
  icon?: ReactNode;
  label: string;
}

/**
 * A small toggle group, rendered by Kumo's segmented Tabs.
 *
 * The props are deliberately unchanged from the hand-rolled DaisyUI version,
 * so every call site is untouched by the swap. What changes is what the user
 * sees: Base UI supplies real tab semantics and arrow-key navigation, which
 * the old row of <button>s never had, and the active state now slides between
 * segments instead of cutting.
 *
 * Every tab strip in this app is `segmented`, and that is measured rather than
 * chosen. The reference dashboard's page-level strip — the Overview / Metrics /
 * Deployments / Bindings row on a Worker — renders Kumo's segmented variant: a
 * filled `oklch(0.965 0 0)` track at an 8px radius, a 6px pill on the active
 * tab, and NO bottom border. An earlier pass here used `underline` for
 * page-level strips on the assumption that a page-level tab is an underline
 * tab; checking the reference showed the opposite.
 *
 * `icon` became optional so this could absorb the DaisyUI `join` groups too.
 * Those turned out not to be one pattern: four of the five were single-select
 * filters — a sort order, a status filter, a date range — which is exactly what
 * a segmented control is, and one was a Previous/Next paginator, which is two
 * independent actions wearing the same clothes. Only the first kind belongs
 * here; grouping the paginator with them is what made `join` look like a
 * component in the first place.
 *
 * Granular import (`@cloudflare/kumo/components/tabs`) rather than the package
 * root — Kumo's README recommends it for tree-shaking, and the root barrel
 * would pull the ECharts-backed chart components into this chunk.
 */
export function SegmentedToggle<T extends string>({
  items,
  value,
  onChange,
  showLabels = false,
}: {
  items: SegmentedToggleItem<T>[];
  value: T;
  onChange: (value: T) => void;
  showLabels?: boolean;
}) {
  return (
    <Tabs
      variant="segmented"
      // "sm" is h-6.5/text-xs, the closest Kumo step to the btn-xs this used
      // to be. There is no xs tab size; going up to "base" (h-9) would make
      // these toggles taller than the controls they sit beside.
      size="sm"
      value={value}
      onValueChange={(next) => {
        // Kumo hands back a plain string. Resolving it against `items` recovers
        // the caller's T without an assertion, which the lint config forbids —
        // and it drops any value that is not ours rather than trusting it.
        const selected = items.find((item) => item.value === next);
        if (selected) onChange(selected.value);
      }}
      tabs={items.map((item) => ({
        value: item.value,
        label: (
          // The title carries the label when it is visually hidden, which is
          // the only affordance icon-only mode has.
          <span className="flex items-center gap-1.5" title={item.label}>
            {item.icon}
            {showLabels ? item.label : null}
          </span>
        ),
      }))}
    />
  );
}
