import { Button } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import type { BacklinksEmptyState } from "./backlinksEmptyState";

export function EmptyTableState({ label }: { label: string }) {
  return (
    <Empty
      size="sm"
      className="rounded-xl border-dashed bg-transparent"
      title={label}
    />
  );
}

/**
 * The results table's empty state, which says which of the several very
 * different "no rows" situations this is, and offers the way out of each.
 */
export function BacklinksEmptyResults({
  state,
  onClearFilters,
  onPreviousPage,
}: {
  state: BacklinksEmptyState;
  onClearFilters: () => void;
  onPreviousPage: () => void;
}) {
  return (
    <Empty
      size="sm"
      className="rounded-xl border-dashed bg-transparent"
      title={state.title}
      description={state.description}
      contents={
        state.actions.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {state.actions.includes("clear-filters") ? (
              <Button variant="secondary" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : null}
            {state.actions.includes("previous-page") ? (
              <Button variant="ghost" size="sm" onClick={onPreviousPage}>
                Previous page
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    />
  );
}
