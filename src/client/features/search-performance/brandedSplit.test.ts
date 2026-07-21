import { describe, expect, it } from "vitest";
import {
  computeBrandedSplit,
  defaultBrandTerms,
  isBrandedQuery,
  parseBrandTerms,
} from "./brandedSplit";

describe("defaultBrandTerms", () => {
  it("takes the registrable stem of the domain", () => {
    expect(defaultBrandTerms("deliotx.com")).toEqual(["deliotx"]);
    expect(defaultBrandTerms("www.Example.co.uk")).toEqual(["example"]);
    expect(defaultBrandTerms("")).toEqual([]);
  });
});

describe("parseBrandTerms", () => {
  it("splits on commas, lowercases, dedupes, drops one-char noise", () => {
    expect(parseBrandTerms("Delio, delio , DELIO TX, x")).toEqual([
      "delio",
      "delio tx",
    ]);
  });
});

describe("isBrandedQuery", () => {
  it("matches substrings and space-insensitive variants", () => {
    expect(isBrandedQuery("delio vending machines", ["delio"])).toBe(true);
    expect(isBrandedQuery("deliotx reviews", ["deliotx"])).toBe(true);
    // "delio tx" written with a space still matches the squashed term.
    expect(isBrandedQuery("delio tx vending", ["deliotx"])).toBe(true);
    expect(isBrandedQuery("office vending dallas", ["deliotx"])).toBe(false);
    expect(isBrandedQuery("anything", [])).toBe(false);
  });
});

describe("computeBrandedSplit", () => {
  const rows = [
    { query: "delio vending", clicks: 10, impressions: 100 },
    { query: "vending machines dallas", clicks: 6, impressions: 300 },
    { query: "deliotx.com", clicks: 4, impressions: 20 },
    { query: "breakroom snacks", clicks: 0, impressions: 50 },
  ];

  it("splits totals and computes branded click share", () => {
    const split = computeBrandedSplit(rows, ["delio"]);
    expect(split.branded).toEqual({
      queries: 2,
      clicks: 14,
      impressions: 120,
    });
    expect(split.nonBranded).toEqual({
      queries: 2,
      clicks: 6,
      impressions: 350,
    });
    expect(split.brandedClickShare).toBeCloseTo(14 / 20);
    expect(split.topBranded.map((row) => row.query)).toEqual([
      "delio vending",
      "deliotx.com",
    ]);
  });

  it("returns a null share when there are no clicks at all", () => {
    const split = computeBrandedSplit(
      [{ query: "a", clicks: 0, impressions: 10 }],
      ["a"],
    );
    expect(split.brandedClickShare).toBeNull();
  });
});
