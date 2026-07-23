import { describe, expect, it } from "vitest";
import { isOffTopic, scoreRelevance, tokenizeSeed } from "./keywordRelevance";

describe("tokenizeSeed", () => {
  it("drops stopwords", () => {
    expect(tokenizeSeed("how to do seo")).toEqual(["seo"]);
  });

  it("keeps every token when the seed is all stopwords", () => {
    expect(tokenizeSeed("how to")).toEqual(["how", "to"]);
  });

  it("splits on punctuation and lowercases", () => {
    expect(tokenizeSeed("Office-Coffee Service")).toEqual([
      "office",
      "coffee",
      "service",
    ]);
  });

  it("tokenizes non-Latin scripts instead of collapsing to an empty seed", () => {
    expect(tokenizeSeed("быстрая доставка")).toEqual(["быстрая", "доставка"]);
  });

  it("folds accents so café and cafe tokenize the same way", () => {
    expect(tokenizeSeed("café")).toEqual(["cafe"]);
  });

  it("strips a possessive apostrophe instead of splitting on it", () => {
    expect(tokenizeSeed("women's shoes")).toEqual(["womens", "shoes"]);
    // Curly apostrophe, the one word processors actually produce.
    expect(tokenizeSeed("women’s shoes")).toEqual(["womens", "shoes"]);
  });

  it("de-duplicates repeated seed words, preserving first-appearance order", () => {
    expect(tokenizeSeed("new york new york hotel")).toEqual([
      "new",
      "york",
      "hotel",
    ]);
  });
});

describe("scoreRelevance", () => {
  const seed = tokenizeSeed("office coffee service");

  it("scores a full phrase match 1", () => {
    expect(scoreRelevance("best office coffee service", seed)).toBe(1);
  });

  it("scores a partial overlap by share of seed tokens", () => {
    expect(scoreRelevance("break room coffee", seed)).toBeCloseTo(1 / 3);
  });

  it("matches singular against plural via a shared prefix", () => {
    expect(scoreRelevance("office coffee services", seed)).toBe(1);
  });

  it("matches an accented seed against an unaccented keyword and back", () => {
    expect(scoreRelevance("cafe", tokenizeSeed("café"))).toBe(1);
    expect(scoreRelevance("café", tokenizeSeed("cafe"))).toBe(1);
  });

  it("scores an unrelated keyword 0", () => {
    expect(scoreRelevance("aria name meaning", seed)).toBe(0);
  });
});

describe("isOffTopic", () => {
  const brandSeed = tokenizeSeed("delio");

  // The exact regression: a depth-3 related walk drifted from "delio" to
  // name meanings, and nothing rejected them.
  it("rejects the drifted name-meaning keywords", () => {
    expect(isOffTopic("obnoxious meaning", brandSeed)).toBe(true);
    expect(isOffTopic("aria name meaning", brandSeed)).toBe(true);
    expect(isOffTopic("zella name meaning", brandSeed)).toBe(true);
  });

  it("keeps keywords that do name the seed", () => {
    expect(isOffTopic("delio meaning", brandSeed)).toBe(false);
    expect(isOffTopic("delio pro", brandSeed)).toBe(false);
  });

  // A 2-char shared prefix is a coincidence, not a stem.
  it("does not treat a near-miss spelling as a match", () => {
    expect(isOffTopic("dealio meaning", brandSeed)).toBe(true);
  });

  // The exact regression this task fixes: a non-Latin seed used to tokenize
  // to [], which silently turned the filter off (empty seed = match nothing).
  it("filters a non-Latin seed the same way as a Latin one", () => {
    const seed = tokenizeSeed("быстрая доставка");
    expect(isOffTopic("значение имени", seed)).toBe(true);
    expect(isOffTopic("быстрая доставка еды", seed)).toBe(false);
  });

  it("treats an empty seed as matching nothing off-topic", () => {
    expect(isOffTopic("anything at all", [])).toBe(false);
  });
});
