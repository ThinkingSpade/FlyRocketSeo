import { describe, expect, it } from "vitest";
import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { KEYWORD_TARGET_SORT_SPECS } from "./keywordTargetsSorting";
import type { KeywordTargetRow } from "./mergeKeywordRows";
import type { QueryMomentum } from "./queryMomentum";

/**
 * Drives the REAL sort specs through the REAL table-core sorting pipeline.
 *
 * `@tanstack/table-core` is headless -- `createTable` needs no renderer and
 * no DOM, so this runs in vitest's `node` environment. Re-exported through
 * `@tanstack/react-table` (its index does `export * from
 * '@tanstack/table-core'`), which is the direct dependency here.
 *
 * This is not a test of the library. It is a test of two decisions the
 * library will silently honour either way: returning `undefined` (not `null`)
 * for a missing value, and carrying `sortUndefined: "last"`. Break either and
 * the pinned rows interleave with the ranked ones -- which for the Rank
 * column is exactly the blended-rank defect this feature exists to prevent,
 * and `tsc` has nothing to say about it.
 */
function row(over: Partial<KeywordTargetRow> = {}): KeywordTargetRow {
  return {
    keyword: "k",
    serpRank: null,
    gscAveragePosition: null,
    searchVolume: null,
    keywordDifficulty: null,
    cpc: null,
    traffic: null,
    url: null,
    urlSource: null,
    pageShare: null,
    impressions: null,
    momentum: null,
    action: null,
    reason: null,
    ...over,
  };
}

function momentum(percent: number | null): QueryMomentum {
  return {
    query: "k",
    impressions: 100,
    prevImpressions: 50,
    percent,
    direction: percent === null ? "unknown" : "rising",
  };
}

/**
 * The sorted keyword order for one column in one direction.
 *
 * `createTable` requires the caller to own state (there is no React here to
 * do it), so sorting is passed in as fixed state rather than toggled.
 */
function sortedKeywords(
  rows: KeywordTargetRow[],
  // Deliberately WIDER than the production spec's own
  // `(row) => number | undefined`: the production specs satisfy it, and
  // widening it here is what lets the "what if it returned null" test below
  // pass a null-returning accessor without a cast. That difference is the
  // whole point of that test.
  spec: { accessorFn: (r: KeywordTargetRow) => number | null | undefined },
  sortUndefined: "last",
  columnId: string,
  desc: boolean,
): string[] {
  const columns: ColumnDef<KeywordTargetRow>[] = [
    { id: "keyword", accessorKey: "keyword" },
    { id: columnId, accessorFn: spec.accessorFn, sortUndefined },
  ];
  const sorting: SortingState = [{ id: columnId, desc }];
  const table = createTable<KeywordTargetRow>({
    data: rows,
    columns,
    state: { sorting },
    onStateChange: () => undefined,
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  table.setOptions((prev) => ({ ...prev, state: { sorting } }));
  return table.getSortedRowModel().rows.map((r) => r.original.keyword);
}

function sortedByRank(rows: KeywordTargetRow[], desc: boolean) {
  return sortedKeywords(
    rows,
    KEYWORD_TARGET_SORT_SPECS.rank,
    KEYWORD_TARGET_SORT_SPECS.rank.sortUndefined,
    "rank",
    desc,
  );
}

describe("Rank sorting never blends the two rank sources", () => {
  // "gsc-*" carry only a Search Console average -- a property-level mean
  // across every impression, naming no URL. If any of them ever lands
  // BETWEEN two SERP-ranked rows, the table is ordering a GSC average
  // against a Labs SERP position, which is the defect.
  const rows = [
    row({ keyword: "serp-3", serpRank: 3 }),
    row({ keyword: "gsc-a", gscAveragePosition: 1.2 }),
    row({ keyword: "serp-11", serpRank: 11 }),
    row({ keyword: "gsc-b", gscAveragePosition: 40 }),
    row({ keyword: "serp-7", serpRank: 7 }),
  ];

  it("orders by SERP rank ascending and pins rank-less rows last", () => {
    expect(sortedByRank(rows, false)).toEqual([
      "serp-3",
      "serp-7",
      "serp-11",
      "gsc-a",
      "gsc-b",
    ]);
  });

  it("keeps rank-less rows last on the SECOND click too", () => {
    // The property `sortUndefined: "last"` buys, and the reason a plain
    // comparator is not enough: table-core applies the undefined branch
    // BEFORE inverting for desc, so these never flip to the top.
    expect(sortedByRank(rows, true)).toEqual([
      "serp-11",
      "serp-7",
      "serp-3",
      "gsc-a",
      "gsc-b",
    ]);
  });

  it("leaves the pinned rows in their incoming (volume-descending) order", () => {
    // mergeKeywordRows has already ordered them; sorting Rank must not
    // reshuffle the rows it refuses to rank.
    expect(sortedByRank(rows, false).slice(3)).toEqual(["gsc-a", "gsc-b"]);
    expect(sortedByRank(rows, true).slice(3)).toEqual(["gsc-a", "gsc-b"]);
  });

  it("would interleave if an accessor returned null instead of undefined", () => {
    // Pins the reason for `?? undefined`. getSortedRowModel tests
    // `value === undefined`, so a null slips past the pin and gets compared
    // as a value -- here sorting AHEAD of every real rank. This test fails
    // the moment someone "simplifies" the accessor to `?? null`.
    const withNull = sortedKeywords(
      rows,
      { accessorFn: (r) => r.serpRank },
      "last",
      "rank",
      false,
    );
    expect(withNull).not.toEqual(sortedByRank(rows, false));
    expect(withNull.slice(-2)).not.toEqual(["gsc-a", "gsc-b"]);
  });
});

describe("the other three numeric columns pin their empty rows the same way", () => {
  it("sorts volume descending with unsized rows last", () => {
    const rows = [
      row({ keyword: "none" }),
      row({ keyword: "small", searchVolume: 90 }),
      row({ keyword: "big", searchVolume: 5000 }),
    ];
    expect(
      sortedKeywords(
        rows,
        KEYWORD_TARGET_SORT_SPECS.searchVolume,
        KEYWORD_TARGET_SORT_SPECS.searchVolume.sortUndefined,
        "searchVolume",
        true,
      ),
    ).toEqual(["big", "small", "none"]);
  });

  it("sorts difficulty with unscored rows last in both directions", () => {
    const rows = [
      row({ keyword: "hard", keywordDifficulty: 80 }),
      row({ keyword: "unscored" }),
      row({ keyword: "easy", keywordDifficulty: 10 }),
    ];
    const spec = KEYWORD_TARGET_SORT_SPECS.keywordDifficulty;
    expect(
      sortedKeywords(
        rows,
        spec,
        spec.sortUndefined,
        "keywordDifficulty",
        false,
      ),
    ).toEqual(["easy", "hard", "unscored"]);
    expect(
      sortedKeywords(rows, spec, spec.sortUndefined, "keywordDifficulty", true),
    ).toEqual(["hard", "easy", "unscored"]);
  });

  it("sorts trend by percent, and does not read an unreadable swing as 0%", () => {
    // "too-thin" is under MIN_IMPRESSIONS_FOR_VERDICT and "labs-only" has no
    // Search Console row at all. Treating either as 0% would sort them
    // between the faller and the riser, asserting a flatness we have not
    // measured.
    const rows = [
      row({ keyword: "falling", momentum: momentum(-60) }),
      row({ keyword: "too-thin", momentum: momentum(null) }),
      row({ keyword: "rising", momentum: momentum(120) }),
      row({ keyword: "labs-only" }),
    ];
    const spec = KEYWORD_TARGET_SORT_SPECS.trend;
    expect(
      sortedKeywords(rows, spec, spec.sortUndefined, "trend", true),
    ).toEqual(["rising", "falling", "too-thin", "labs-only"]);
  });
});
