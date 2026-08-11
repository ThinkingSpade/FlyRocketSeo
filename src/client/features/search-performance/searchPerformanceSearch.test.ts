import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_PERFORMANCE_TAB,
  searchPerformanceSearchSchema,
  tabSearchValue,
} from "./searchPerformanceSearch";

describe("searchPerformanceSearchSchema", () => {
  it("carries the query and the tab an inbound link named", () => {
    // SEO Opportunities' "Review" on a CTR row sends both. Before this schema
    // existed the whole search object was discarded, so the link landed on the
    // striking-distance tab with no idea which query it was sent about.
    expect(
      searchPerformanceSearchSchema.parse({ q: "office coffee", tab: "ctr" }),
    ).toEqual({ q: "office coffee", tab: "ctr" });
  });

  it("leaves both undefined for a plain visit", () => {
    expect(searchPerformanceSearchSchema.parse({})).toEqual({
      q: undefined,
      tab: undefined,
    });
  });

  it("drops an empty query rather than filtering on nothing", () => {
    expect(searchPerformanceSearchSchema.parse({ q: "" }).q).toBeUndefined();
  });

  it("falls back to the default tab for a value it does not know", () => {
    // A stale or hand-edited URL must degrade to the default view. Throwing
    // here would blank the tab over a typo in the address bar.
    expect(
      searchPerformanceSearchSchema.parse({ tab: "backlinks" }).tab,
    ).toBeUndefined();
  });

  it("survives wrongly typed params", () => {
    expect(searchPerformanceSearchSchema.parse({ q: 7, tab: 3 })).toEqual({
      q: undefined,
      tab: undefined,
    });
  });
});

describe("tabSearchValue", () => {
  it("omits the default so opening the tab does not rewrite its own URL", () => {
    expect(tabSearchValue(DEFAULT_SEARCH_PERFORMANCE_TAB)).toBeUndefined();
  });

  it("writes any other tab, so the choice can be shared", () => {
    expect(tabSearchValue("ctr")).toBe("ctr");
    expect(tabSearchValue("pages")).toBe("pages");
  });
});
