import { describe, expect, it } from "vitest";
import { rankSeedSuggestions } from "./seedSuggestions";

const domain = "deliotx.com";

describe("rankSeedSuggestions", () => {
  // The exact regression: the brand always wins on impressions, so the tab
  // seeded "delio" and researched the meaning of names.
  it("ranks a lower-impression non-branded query above the brand", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [
        { query: "delio", impressions: 5000, position: 1.2 },
        { query: "office coffee service", impressions: 120, position: 14.3 },
      ],
      savedKeywords: [],
      domain,
    });
    expect(ranked[0].keyword).toBe("office coffee service");
    expect(ranked[0].branded).toBe(false);
  });

  it("still offers branded queries, marked and last", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [
        { query: "delio", impressions: 5000, position: 1.2 },
        { query: "office coffee service", impressions: 120, position: 14.3 },
      ],
      savedKeywords: [],
      domain,
    });
    expect(ranked.at(-1)).toMatchObject({ keyword: "delio", branded: true });
  });

  it("matches a spaced brand against the domain stem", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [{ query: "delio tx", impressions: 900, position: 2 }],
      savedKeywords: [],
      domain,
    });
    expect(ranked[0].branded).toBe(true);
  });

  it("orders non-branded queries by impressions", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [
        { query: "coffee machines", impressions: 50, position: 20 },
        { query: "office coffee service", impressions: 300, position: 12 },
      ],
      savedKeywords: [],
      domain,
    });
    expect(ranked.map((s) => s.keyword)).toEqual([
      "office coffee service",
      "coffee machines",
    ]);
  });

  it("falls back to saved keywords when Search Console has nothing", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [],
      savedKeywords: [{ keyword: "vending machines", searchVolume: 2400 }],
      domain,
    });
    expect(ranked[0]).toMatchObject({
      keyword: "vending machines",
      branded: false,
    });
    expect(ranked[0].hint).toContain("2.4k");
  });

  // A project with no Search Console data is the likeliest to have saved its
  // own brand as a keyword, so this path needs the same ordering as the GSC one.
  it("ranks branded saved keywords last too", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [],
      savedKeywords: [
        { keyword: "deliotx reviews", searchVolume: 90 },
        { keyword: "office coffee service", searchVolume: 1600 },
      ],
      domain,
    });
    expect(ranked[0].keyword).toBe("office coffee service");
    expect(ranked.at(-1)).toMatchObject({
      keyword: "deliotx reviews",
      branded: true,
    });
  });

  it("returns nothing rather than a useless seed", () => {
    expect(
      rankSeedSuggestions({ gscQueries: [], savedKeywords: [], domain }),
    ).toEqual([]);
  });

  it("carries the number that justifies each suggestion", () => {
    const ranked = rankSeedSuggestions({
      gscQueries: [
        { query: "office coffee service", impressions: 1200, position: 14.34 },
      ],
      savedKeywords: [],
      domain,
    });
    expect(ranked[0].hint).toBe("1.2k impressions · pos 14.3");
  });

  it("caps the list at the limit", () => {
    const gscQueries = Array.from({ length: 20 }, (_, i) => ({
      query: `keyword ${i}`,
      impressions: 100 - i,
      position: 10,
    }));
    expect(
      rankSeedSuggestions({ gscQueries, savedKeywords: [], domain, limit: 5 }),
    ).toHaveLength(5);
  });
});
