import { describe, expect, it } from "vitest";
import {
  createVocabularyMatcher,
  matchDomainsToVocabulary,
} from "@/shared/domainVocabularyMatch";

const TERMS = ["vending", "breakroom", "coffee", "snack", "nutrition"];

describe("matchDomainsToVocabulary", () => {
  it("matches on the stem and reports which term hit", () => {
    const matches = matchDomainsToVocabulary({
      domains: ["swindonvending.com", "unrelated.com"],
      terms: TERMS,
      exclude: [],
      limit: 100,
    });

    expect(matches).toEqual([
      { domain: "swindonvending.com", matchedTerm: "vending" },
    ]);
  });

  // The TLD is not vocabulary. Without this, every `.coffee` domain matches
  // "coffee" and a whole TLD floods the harvest.
  it("ignores the TLD when matching", () => {
    const matches = matchDomainsToVocabulary({
      domains: ["something.coffee"],
      terms: TERMS,
      exclude: [],
      limit: 100,
    });

    expect(matches).toEqual([]);
  });

  it("reports the longest matching term, not merely the first", () => {
    // "breakroom" is the more specific signal; "room" alone would be noise.
    const matches = matchDomainsToVocabulary({
      domains: ["mybreakroomsupply.com"],
      terms: ["room", "breakroom"],
      exclude: [],
      limit: 100,
    });

    expect(matches[0]?.matchedTerm).toBe("breakroom");
  });

  it("never returns the project's own domain or a competitor", () => {
    const matches = matchDomainsToVocabulary({
      domains: ["deliotx.com", "rivalvending.com", "goodvending.com"],
      terms: ["vending", "deliotx"],
      exclude: ["Deliotx.com", "rivalvending.com"],
      limit: 100,
    });

    expect(matches.map((m) => m.domain)).toEqual(["goodvending.com"]);
  });

  it("dedupes repeated names within a day's file", () => {
    const matches = matchDomainsToVocabulary({
      domains: ["a-vending.com", "a-vending.com"],
      terms: TERMS,
      exclude: [],
      limit: 100,
    });

    expect(matches).toHaveLength(1);
  });

  // A day is ~84k .com names; an unbounded match set would be stored and
  // DR-graded without limit.
  it("respects the limit", () => {
    const domains = Array.from({ length: 50 }, (_, i) => `vending${i}.com`);
    expect(
      matchDomainsToVocabulary({
        domains,
        terms: TERMS,
        exclude: [],
        limit: 10,
      }).length,
    ).toBe(10);
  });

  it("is case-insensitive on both sides", () => {
    const matches = matchDomainsToVocabulary({
      domains: ["BigVending.COM"],
      terms: ["VENDING"],
      exclude: [],
      limit: 100,
    });

    expect(matches[0]?.domain).toBe("bigvending.com");
  });

  it("ignores blank terms rather than matching everything", () => {
    expect(
      matchDomainsToVocabulary({
        domains: ["anything.com"],
        terms: ["", "   "],
        exclude: [],
        limit: 100,
      }),
    ).toEqual([]);
  });

  it("skips terms too short to be meaningful", () => {
    // "co" would match a large share of all domains.
    expect(
      matchDomainsToVocabulary({
        domains: ["company.com"],
        terms: ["co"],
        exclude: [],
        limit: 100,
      }),
    ).toEqual([]);
  });
});

describe("createVocabularyMatcher", () => {
  it("lets a later boundary hit replace weak substring collisions at the cap", () => {
    const matcher = createVocabularyMatcher({
      terms: ["rent"],
      exclude: [],
      limit: 1,
    });
    for (let index = 0; index < 5; index += 1) {
      expect(matcher.accept(`current${index}.com`)).toBe(true);
    }
    expect(matcher.accept("rentals.com")).toBe(false);
    expect(matcher.matches).toEqual([
      { domain: "rentals.com", matchedTerm: "rent" },
    ]);
  });

  it("finds a later boundary occurrence after an earlier weak hit", () => {
    const matcher = createVocabularyMatcher({
      terms: ["rent", "hire"],
      exclude: [],
      limit: 1,
    });
    expect(matcher.accept("current0-hire.com")).toBe(false);
    expect(matcher.matches).toEqual([
      { domain: "current0-hire.com", matchedTerm: "hire" },
    ]);
  });

  it("finds a boundary occurrence that overlaps an earlier weak hit", () => {
    const matcher = createVocabularyMatcher({
      terms: ["aaaa", "aaab"],
      exclude: [],
      limit: 1,
    });

    expect(matcher.accept("xaaaab.com")).toBe(false);
    expect(matcher.matches).toEqual([
      { domain: "xaaaab.com", matchedTerm: "aaab" },
    ]);
  });

  it("keeps only the capped weak fallbacks while consuming the full stream", () => {
    const matcher = createVocabularyMatcher({
      terms: ["rent"],
      exclude: [],
      limit: 2,
    });
    const decisions = Array.from({ length: 5 }, (_, index) =>
      matcher.accept(`current${index}.com`),
    );
    expect(decisions).toEqual([true, true, true, true, true]);
    expect(matcher.matches.map((match) => match.domain)).toEqual([
      "current0.com",
      "current1.com",
    ]);
  });

  it("prioritizes hits at the stem start, end, and a word separator", () => {
    const matcher = createVocabularyMatcher({
      terms: ["rent"],
      exclude: [],
      limit: 3,
    });

    expect(matcher.accept("current0.com")).toBe(true);
    expect(matcher.accept("current1.com")).toBe(true);
    expect(matcher.accept("current2.com")).toBe(true);
    expect(matcher.accept("rentals.com")).toBe(true);
    expect(matcher.accept("parent.com")).toBe(true);
    expect(matcher.accept("best-rent-deals.com")).toBe(false);
    expect(matcher.matches.map((match) => match.domain)).toEqual([
      "rentals.com",
      "parent.com",
      "best-rent-deals.com",
    ]);
  });
});
