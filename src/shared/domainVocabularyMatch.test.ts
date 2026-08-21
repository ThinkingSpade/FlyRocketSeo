import { describe, expect, it } from "vitest";
import { matchDomainsToVocabulary } from "@/shared/domainVocabularyMatch";

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
