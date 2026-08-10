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
  prepareBreakdownPresentation,
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

describe("breakdown presentation", () => {
  it("reports a blank country separately from classified country meters", () => {
    const presentation = prepareBreakdownPresentation(
      "sourceCountry",
      [
        { label: "   ", value: 28 },
        { label: "CV", value: 1 },
        { label: "IN", value: 1 },
      ],
      30,
    );

    expect(presentation.mode).toBe("meters");
    expect(presentation.notice).toBe(
      "Country not reported for 28 of 30 backlinks",
    );
    expect(presentation.rows[0].displayLabel).toMatch(/\(CV\)$/);
    expect(presentation.rows[0].displayLabel).not.toBe("CV");
    expect(presentation.rows[1].displayLabel).toBe("India (IN)");
  });

  it("uses a sentence when only one positive category remains", () => {
    const presentation = prepareBreakdownPresentation(
      "sourceTld",
      [
        { label: "com", value: 30 },
        { label: "org", value: 0 },
      ],
      30,
    );

    expect(presentation.mode).toBe("sentence");
    expect(presentation.max).toBeNull();
    expect(presentation.sentence).toBe(
      ".com is the only top-level domain reported",
    );

    const linkType = prepareBreakdownPresentation(
      "itemType",
      [{ label: "anchor", value: 30 }],
      30,
    );
    expect(linkType.mode).toBe("sentence");
    expect(linkType.sentence).toBe("Anchor is the only link type reported");
  });

  it("uses a not-provided line when every category is zero", () => {
    const presentation = prepareBreakdownPresentation(
      "itemType",
      [
        { label: "anchor", value: 0 },
        { label: "link", value: 0 },
      ],
      0,
    );

    expect(presentation).toMatchObject({
      mode: "not-provided",
      max: null,
      sentence: "Link type not provided for this profile",
    });
    expect(presentation.rows).toEqual([]);
  });

  it("calls out sole unclassified site type and placement values", () => {
    expect(
      prepareBreakdownPresentation(
        "sourcePlatformType",
        [{ label: " unknown ", value: 30 }],
        30,
      ),
    ).toMatchObject({
      mode: "sentence",
      sentence: "Site type wasn't classified for this profile",
    });
    expect(
      prepareBreakdownPresentation(
        "semanticLocation",
        [{ label: "anchor", value: 30 }],
        30,
      ),
    ).toMatchObject({
      mode: "sentence",
      sentence: "Placement wasn't classified for this profile",
    });
  });

  it("does not merge selectable rows with equal normalized labels", () => {
    const presentation = prepareBreakdownPresentation(
      "sourcePlatformType",
      [
        { label: "blogs", value: 12 },
        { label: " blogs ", value: 7 },
      ],
      19,
    );

    expect(presentation.mode).toBe("meters");
    expect(presentation.rows).toHaveLength(2);
    expect(presentation.rows.map((row) => row.value)).toEqual([12, 7]);
  });
});
