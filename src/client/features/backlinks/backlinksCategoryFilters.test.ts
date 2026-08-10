import { describe, expect, it } from "vitest";
import {
  EMPTY_BACKLINKS_FILTERS,
  type BacklinksTabFilterValues,
} from "./backlinksFilterTypes";
import {
  activeCategoryFilters,
  formatCategoryValue,
  hasActiveCategoryFilter,
  isSelectableCategoryValue,
} from "./backlinksCategoryFilters";

describe("breakdown drill-down values", () => {
  it("refuses to drill into a row the provider left blank", () => {
    // A real profile returns an empty country code holding most of its links.
    // Sending "" would filter nothing and return the whole list as if it were
    // the slice, which is worse than not offering the row at all.
    expect(isSelectableCategoryValue("")).toBe(false);
    expect(isSelectableCategoryValue("   ")).toBe(false);
    expect(isSelectableCategoryValue("IN")).toBe(true);
  });

  it("keeps a literal 'unknown' selectable, since the filter accepts it", () => {
    expect(isSelectableCategoryValue("unknown")).toBe(true);
  });

  it("names a blank row instead of drawing a nameless bar", () => {
    expect(formatCategoryValue("sourceCountry", "")).toBe(
      "Country not provided",
    );
    expect(formatCategoryValue("sourcePlatformType", "  ")).toBe(
      "Site type not provided",
    );
  });

  it("humanizes for display only", () => {
    expect(formatCategoryValue("sourceCountry", "IN")).toBe("India (IN)");
    expect(formatCategoryValue("sourceTld", "com")).toBe(".com");
    expect(formatCategoryValue("linkAttribute", "nofollow")).toBe("Nofollow");
    expect(formatCategoryValue("sourcePlatformType", "blogs")).toBe("Blogs");
  });

  it("lists applied drill-downs as chips, ignoring unset dimensions", () => {
    const active = activeCategoryFilters({
      ...EMPTY_BACKLINKS_FILTERS,
      sourcePlatformType: "blogs",
      itemType: "anchor",
      sourceTld: "   ",
    });

    expect(active.map((entry) => entry.chipLabel)).toEqual([
      "Link type: Anchor",
      "Site type: Blogs",
    ]);
    expect(active.map((entry) => entry.rawValue)).toEqual(["anchor", "blogs"]);
  });

  it("reports no active drill-down for an untouched filter set", () => {
    expect(hasActiveCategoryFilter(EMPTY_BACKLINKS_FILTERS)).toBe(false);
  });

  it("does not mistake a manual filter for a drill-down", () => {
    // Only the six category dimensions force the All links view and get a chip.
    const manualOnly: BacklinksTabFilterValues = {
      ...EMPTY_BACKLINKS_FILTERS,
      include: "example.com",
      minDomainRank: "20",
    };

    expect(hasActiveCategoryFilter(manualOnly)).toBe(false);
    expect(activeCategoryFilters(manualOnly)).toEqual([]);
  });
});
