import { describe, expect, it } from "vitest";
import {
  computeBrandedSplit,
  defaultBrandTerms,
  isBrandedQuery,
  looksLikeClippedBrand,
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

  // Shape-based clipping lives in looksLikeClippedBrand, deliberately outside
  // this function, so the analytics card is never moved by a guess.
  it("leaves a clipped brand to the caller to corroborate", () => {
    expect(isBrandedQuery("delio", ["deliotx"])).toBe(false);
    expect(isBrandedQuery("roofer near me", ["roofers"])).toBe(false);
  });
});

describe("looksLikeClippedBrand", () => {
  it("spots the brand with a short tail removed", () => {
    expect(looksLikeClippedBrand("delio", ["deliotx"])).toBe(true);
    expect(looksLikeClippedBrand("delio reviews", ["deliotx"])).toBe(true);
    expect(looksLikeClippedBrand("acme pricing", ["acmeco"])).toBe(true);
  });

  it("does not fire on words that merely start a longer brand", () => {
    // Three characters short of "shopify", and a word in its own right.
    expect(looksLikeClippedBrand("shop", ["shopify"])).toBe(false);
    expect(looksLikeClippedBrand("car insurance", ["carpetworld"])).toBe(false);
    // Too short to be a clipped brand at all.
    expect(looksLikeClippedBrand("nik", ["nike"])).toBe(false);
    expect(looksLikeClippedBrand("delicious coffee", ["deliotx"])).toBe(false);
  });

  /**
   * The reason this is shape-only and needs a second signal. Every case here
   * is textually identical to "delio"/"deliotx" and semantically its opposite:
   * a generic head plus a two-character suffix, where the head is the site's
   * most valuable NON-branded query. rankSeedSuggestions separates them with
   * Search Console position, which is why this predicate must never be used
   * on its own.
   */
  it("cannot tell a generic head from a real clipped brand", () => {
    expect(looksLikeClippedBrand("coffee near me", ["coffeeco"])).toBe(true);
    expect(looksLikeClippedBrand("bakery near me", ["bakerytx"])).toBe(true);
    expect(looksLikeClippedBrand("plumbing repair", ["plumbingco"])).toBe(true);
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
