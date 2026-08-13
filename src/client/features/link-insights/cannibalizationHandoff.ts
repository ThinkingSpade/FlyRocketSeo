import { linkOptions } from "@tanstack/react-router";

/**
 * Where one cannibalization card hands off to: Link Opportunities, carrying
 * the single query that card is about.
 *
 * Every card here is a query two or more of the client's own pages both rank
 * for, and the remedy is to pick a winner and point internal links at it --
 * which is exactly the question `/p/$projectId/links` answers. That route
 * reads `?q=` into its own `focusQuery`, the same prop `CannibalizationPage`
 * takes, so the two tabs are symmetric and this is a handoff rather than a
 * fresh search.
 *
 * `search` is a plain OBJECT, deliberately. `functionalUpdate`
 * (@tanstack/router-core) REPLACES the entire search when handed an object and
 * merges only when handed a function -- the trap commit fbeaa23c fixed in six
 * SAME-route verdict actions, which needed the merging form to keep the
 * analyzed target they were navigating away from. This link is CROSS-route:
 * `/p/$projectId/links` validates its own schema and `q` is the whole of it,
 * so replacing is what we want. Merging would carry this page's own search
 * across, and the only key it has is a `q` of its own -- the stale query the
 * user is navigating away from, which is precisely what must not survive.
 *
 * Returns null for a blank query rather than an unusable link: the
 * destination parses `q` with `z.string().min(1).optional().catch(undefined)`,
 * so `?q=` lands as undefined and the card the user clicked would not be
 * focused at all. Better to offer no action than a silent no-op.
 *
 * Trimmed on the way out because the receiver trims on the way in
 * (`focusQuery?.trim().toLowerCase()`) before matching it against a row.
 */
export function linkOpportunitiesHandoff(projectId: string, query: string) {
  const q = query.trim();
  if (q === "") return null;
  return linkOptions({
    to: "/p/$projectId/links",
    params: { projectId },
    search: { q },
  });
}
