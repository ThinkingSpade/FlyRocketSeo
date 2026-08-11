import { describe, expect, it } from "vitest";
import { EMPTY_BACKLINKS_FILTERS } from "./backlinksFilterTypes";
import {
  buildRowsSignature,
  isRowsQueryReleased,
  isRowsTransactionStale,
  rowsSignaturesMatch,
  serializeFilterValues,
} from "./backlinksRowsTransaction";

const base = {
  target: "example.com",
  scope: "domain",
  tab: "backlinks",
  view: "all" as string | undefined,
  page: 1,
  pageSize: 100,
  filters: EMPTY_BACKLINKS_FILTERS,
};

describe("row query transaction", () => {
  it("holds the paid query closed until every part of the change has landed", () => {
    // A drill-down moves the sub-tab, the view, the filters and the page. Each
    // half-applied combination is a distinct query key, and enabling one bills
    // for a request the user never asked for.
    const expected = buildRowsSignature({
      ...base,
      filters: { ...EMPTY_BACKLINKS_FILTERS, sourcePlatformType: "blogs" },
    });
    const filtersAppliedButPageStale = buildRowsSignature({
      ...base,
      page: 3,
      filters: { ...EMPTY_BACKLINKS_FILTERS, sourcePlatformType: "blogs" },
    });
    const routerLandedButFiltersStale = buildRowsSignature(base);

    expect(isRowsQueryReleased(expected, filtersAppliedButPageStale)).toBe(
      false,
    );
    expect(isRowsQueryReleased(expected, routerLandedButFiltersStale)).toBe(
      false,
    );
    expect(isRowsQueryReleased(expected, expected)).toBe(true);
  });

  it("runs normally when no change is in flight", () => {
    expect(isRowsQueryReleased(null, buildRowsSignature(base))).toBe(true);
  });

  it("treats a difference in any single field as not yet arrived", () => {
    const expected = buildRowsSignature(base);
    const variants = [
      { ...base, target: "other.com" },
      { ...base, scope: "page" },
      { ...base, tab: "domains" },
      { ...base, view: undefined },
      { ...base, page: 2 },
      { ...base, pageSize: 50 },
      { ...base, filters: { ...EMPTY_BACKLINKS_FILTERS, itemType: "anchor" } },
    ];

    for (const variant of variants) {
      expect(rowsSignaturesMatch(expected, buildRowsSignature(variant))).toBe(
        false,
      );
    }
  });

  it("abandons a change whose target or scope moved underneath it", () => {
    // Otherwise a superseded navigation leaves the table disabled forever.
    const pending = buildRowsSignature(base);

    expect(
      isRowsTransactionStale(pending, { target: "other.com", scope: "domain" }),
    ).toBe(true);
    expect(
      isRowsTransactionStale(pending, { target: "example.com", scope: "page" }),
    ).toBe(true);
    expect(
      isRowsTransactionStale(pending, {
        target: " example.com ",
        scope: "domain",
      }),
    ).toBe(false);
  });

  it("compares filters by value, not by key order or padding", () => {
    const a = serializeFilterValues({
      ...EMPTY_BACKLINKS_FILTERS,
      itemType: "anchor",
    });
    const b = serializeFilterValues({
      ...EMPTY_BACKLINKS_FILTERS,
      itemType: " anchor ",
    });

    expect(a).toBe(b);
  });
});
