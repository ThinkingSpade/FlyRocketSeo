import { describe, expect, it } from "vitest";
import { toGeoDisplayName } from "./geoDisplayName";

/**
 * Real stored `geo_locations.name` formats, verified live against production
 * D1 (not invented — see this plan's own warning about propagating Plan 1's
 * invented DMA code):
 *
 *   DMA Region:  "Dallas-Ft. Worth, TX,Texas,United States"   (code 200623)
 *   City:        "Anchorage,Alaska,United States"
 *   County:      "Calhoun County,Alabama,United States"
 *   Postal Code: "01001,Massachusetts,United States"
 *
 * All four share the same trailing "<name>,<StateFullName>,<Country>" shape.
 * DMA Region is the one exception: Nielsen's own DMA naming convention
 * already embeds the state abbreviation in the name itself (", TX"), which is
 * also the source of the inconsistent comma spacing — a space after that
 * first, embedded comma, none before "Texas" or "United States".
 */
describe("toGeoDisplayName", () => {
  it("drops the redundant state and country for a DMA Region (its own name already embeds the state)", () => {
    expect(
      toGeoDisplayName(
        "Dallas-Ft. Worth, TX,Texas,United States",
        "DMA Region",
      ),
    ).toBe("Dallas-Ft. Worth, TX");
  });

  it("keeps the state but drops the country for a City", () => {
    expect(toGeoDisplayName("Anchorage,Alaska,United States", "City")).toBe(
      "Anchorage, Alaska",
    );
  });

  it("keeps the state but drops the country for a County", () => {
    expect(
      toGeoDisplayName("Calhoun County,Alabama,United States", "County"),
    ).toBe("Calhoun County, Alabama");
  });

  it("keeps the state but drops the country for a Postal Code", () => {
    expect(
      toGeoDisplayName("01001,Massachusetts,United States", "Postal Code"),
    ).toBe("01001, Massachusetts");
  });

  it("returns a name with no commas unchanged", () => {
    expect(toGeoDisplayName("United States", "Country")).toBe("United States");
  });

  it("normalizes inconsistent comma spacing to the same display name", () => {
    const noSpacesAtAll = "Dallas-Ft. Worth,TX,Texas,United States";
    const spaceAfterEveryComma = "Dallas-Ft. Worth, TX, Texas, United States";
    expect(toGeoDisplayName(noSpacesAtAll, "DMA Region")).toBe(
      "Dallas-Ft. Worth, TX",
    );
    expect(toGeoDisplayName(spaceAfterEveryComma, "DMA Region")).toBe(
      "Dallas-Ft. Worth, TX",
    );
  });

  it("returns an empty string unchanged, without throwing", () => {
    expect(toGeoDisplayName("", "City")).toBe("");
  });

  it("does not strip below what's available for a short DMA Region name", () => {
    // Defensive: a DMA row with fewer than 3 segments would be reduced to ""
    // by blindly dropping 2 -- keep the raw value instead of destroying it.
    expect(toGeoDisplayName("SomeMetro,United States", "DMA Region")).toBe(
      "SomeMetro,United States",
    );
  });
});
