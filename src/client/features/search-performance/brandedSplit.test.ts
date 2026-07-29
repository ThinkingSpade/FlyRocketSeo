import { describe, expect, it } from "vitest";
import {
  computeBrandedSplit,
  defaultBrandTerms,
  isBrandedQuery,
  parseBrandTerms,
  looksLikeClippedBrand,
  isBrandSeed,
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

describe("looksLikeClippedBrand", () => {
  it("matches the brand with a short tail removed", () => {
    expect(looksLikeClippedBrand("delio", ["deliotx"])).toBe(true);
  });

  it("matches inside a longer query", () => {
    expect(looksLikeClippedBrand("delio coffee", ["deliotx"])).toBe(true);
  });

  it("rejects a word too short to be a brand", () => {
    // "shop" is a prefix of "shopify" but nobody searching it means Shopify.
    expect(looksLikeClippedBrand("shop", ["shopify"])).toBe(false);
  });

  it("rejects a clip that drops more than a short suffix", () => {
    expect(looksLikeClippedBrand("carpet", ["carpetworldonline"])).toBe(false);
  });

  it("rejects a word that merely starts the same way", () => {
    expect(looksLikeClippedBrand("delicious", ["deliotx"])).toBe(false);
  });

  it("returns false with no brand terms", () => {
    expect(looksLikeClippedBrand("delio", [])).toBe(false);
  });
});

describe("isBrandSeed", () => {
  it("treats a containment match as branded at any position", () => {
    expect(isBrandSeed("deliotx reviews", 40, ["deliotx"])).toBe(true);
  });

  it("treats a top-ranked clipped brand as branded", () => {
    expect(isBrandSeed("delio", 1.2, ["deliotx"])).toBe(true);
  });

  it("does NOT brand a generic head the site ranks poorly for", () => {
    // The case that makes shape alone unusable: "bakerytx" minus "tx" is the
    // word bakery, and "bakery near me" is this site's best NON-branded query.
    // Position is the evidence that separates it from a real clipped brand.
    expect(isBrandSeed("bakery", 18, ["bakerytx"])).toBe(false);
  });

  it("brands a generic head the site does rank top for", () => {
    // Same string, opposite answer — ranking #1 for it means it IS the brand.
    expect(isBrandSeed("bakery", 1, ["bakerytx"])).toBe(true);
  });

  it("is inert when the project has no brand terms", () => {
    expect(isBrandSeed("anything", 1, [])).toBe(false);
  });
});
