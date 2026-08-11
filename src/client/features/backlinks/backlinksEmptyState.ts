/**
 * What an empty results table should say.
 *
 * Every branch here was previously the same sentence -- "No backlinks match
 * this filter" -- which is wrong whenever no filter is set, and unhelpful when
 * one is, because it never says which filter or how to leave. The distinction
 * that matters most is measured-zero versus nothing-asked-for: a profile with
 * no links and a filter that excluded everything are different facts about the
 * user's site, and collapsing them hides the one they can act on.
 */

export type BacklinksEmptyState = {
  title: string;
  description?: string;
  /** Offered in addition to the message; both can apply at once. */
  actions: Array<"clear-filters" | "previous-page">;
};

export function resolveBacklinksEmptyState({
  hasCategoryFilter,
  hasManualFilter,
  page,
}: {
  /** A breakdown drill-down is applied, and shown as a removable chip. */
  hasCategoryFilter: boolean;
  /** Any filter set through the filter panel. */
  hasManualFilter: boolean;
  page: number;
}): BacklinksEmptyState {
  // Paging past the end is recoverable from any of the states below, so the
  // way back is always offered rather than being its own exclusive branch.
  const actions: BacklinksEmptyState["actions"] = [];
  if (hasCategoryFilter || hasManualFilter) actions.push("clear-filters");
  if (page > 1) actions.push("previous-page");

  if (hasCategoryFilter) {
    return {
      title: "No matching links in the table",
      // Says why without blaming a mechanism that is not running: this page
      // applies no spam cutoff and no grouping, so the honest reason is that
      // the two numbers are measured separately.
      description:
        "The summary count is measured across the whole profile and can include links this table doesn't return.",
      actions,
    };
  }

  if (hasManualFilter) {
    return { title: "No backlinks match these filters", actions };
  }

  if (page > 1) {
    return { title: `No results on page ${page}`, actions };
  }

  return {
    title: "No backlinks found for this target",
    actions,
  };
}
