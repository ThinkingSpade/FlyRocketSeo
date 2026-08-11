import type { KeywordTargetRow } from "./mergeKeywordRows";

/**
 * The sort configuration for the four numeric columns of
 * `KeywordTargetsTable`, pulled out of the component purely so it can be
 * TESTED.
 *
 * Vitest runs in `node` here and cannot render a component, but
 * `@tanstack/table-core`'s `createTable` is headless -- so the ordering these
 * produce IS testable, as long as the definitions live somewhere a test can
 * import without pulling in JSX. Two regressions are worth pinning, and
 * neither is visible to `tsc`:
 *
 *  1. `?? undefined`, never `?? null`. `getSortedRowModel` checks
 *     `value === undefined` (getSortedRowModel.js), so a `null` here silently
 *     falls through to the default comparator and INTERLEAVES the rows that
 *     are supposed to be pinned.
 *  2. `sortUndefined: "last"` on every one of them. That branch returns
 *     before the `desc` inversion, which is the only reason pinned rows stay
 *     at the bottom on a second click instead of flipping to the top.
 *
 * For `rank` those two together are what stop the table blending a Labs SERP
 * position with a Search Console property average -- different measurements,
 * and any ordering that interleaves them is the blended rank this whole
 * feature is built to avoid.
 */
type SortSpec = {
  /** Returns `undefined` -- NOT null -- when this row has no such value. */
  accessorFn: (row: KeywordTargetRow) => number | undefined;
  sortUndefined: "last";
};

export const KEYWORD_TARGET_SORT_SPECS = {
  /** The live SERP position ALONE. A row carrying only Search Console's
   *  average has none, and pins to the bottom rather than being ordered
   *  against a number that measures something else. */
  rank: {
    accessorFn: (row) => row.serpRank ?? undefined,
    sortUndefined: "last",
  },
  searchVolume: {
    accessorFn: (row) => row.searchVolume ?? undefined,
    sortUndefined: "last",
  },
  keywordDifficulty: {
    accessorFn: (row) => row.keywordDifficulty ?? undefined,
    sortUndefined: "last",
  },
  /** The impression swing. Null percent -- a Labs-only keyword, or a row
   *  under MIN_IMPRESSIONS_FOR_VERDICT -- pins last rather than being read
   *  as 0%, because neither of those is "flat". */
  trend: {
    accessorFn: (row) => row.momentum?.percent ?? undefined,
    sortUndefined: "last",
  },
} satisfies Record<string, SortSpec>;
