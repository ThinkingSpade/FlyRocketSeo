import type { ReactNode } from "react";

/**
 * The one live card surface.
 *
 * There were 61 files carrying their own copy of this wrapper, in at least four
 * spellings — `card border border-base-300 bg-base-100`, the same tokens in
 * reverse order, `rounded-lg border border-base-300 bg-base-100 p-4`, and a
 * `rounded-xl` variant — so "a card" meant a slightly different thing depending
 * on which feature you were looking at.
 *
 * Deliberately minimal API. There is no `className`, `padding`, `radius`,
 * `border`, `background`, `tone` or `shadow` prop, because every one of those is
 * how the drift got in: an escape hatch is an invitation to add the 62nd
 * spelling. Body spacing is fixed at `gap-3 p-4`, the majority of the current
 * `gap-2` / `gap-3` / `p-4` / `p-5` mix.
 *
 * No shadow on purpose: both themes set `--depth: 0` in `app.css`, so a card
 * shadow contradicts the theme rather than decorating it.
 *
 * `flush` is the single variant, and it earns its place by being STRUCTURAL
 * rather than cosmetic — a table or list has to reach the card edges and bring
 * its own header, dividers and scroll container. Feature adapters like
 * `DashboardCard` and `AnalyzeDomainPrompt` should compose this rather than
 * pushing their slots onto it.
 */
export function AppCard({
  children,
  flush = false,
}: {
  children: ReactNode;
  /** Drop the padded body so the child owns the full card area — for tables and
   *  divided lists that must run edge to edge. */
  flush?: boolean;
}) {
  return (
    <div className="card overflow-hidden border border-base-300 bg-base-100">
      {flush ? children : <div className="card-body gap-3 p-4">{children}</div>}
    </div>
  );
}
