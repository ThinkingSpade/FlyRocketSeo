import { describe, expect, it } from "vitest";
import {
  classifyKeyword,
  hasUsableProfile,
  normalizeText,
  offerTerms,
  parseExclusionLine,
  parseExclusions,
} from "./keywordFit";

// The real project this feature was built for: deliotx.com, a Dallas-Ft.
// Worth vending OPERATOR. They place and service machines in offices; they do
// not sell machines. Every keyword below came out of an actual "dfw vending"
// run against DataForSEO.
const DELIOTX = {
  offer:
    "We place and service vending machines, micro markets, and office coffee and water for businesses",
  exclusions: "We don't sell machines\nWe don't repair customer-owned machines",
};

describe("normalizeText", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeText("  Vending-Machines,   FOR SALE!  ")).toBe(
      "vending machines for sale",
    );
  });

  it("returns an empty string for punctuation-only input", () => {
    expect(normalizeText("--- ,, ")).toBe("");
  });
});

describe("parseExclusionLine", () => {
  it("finds the ruled-out role and the object it applies to", () => {
    const parsed = parseExclusionLine("We don't sell machines");
    expect(parsed?.family.id).toBe("purchase");
    expect(parsed?.object).toBe("machine");
  });

  it("keeps the user's own wording for the reason string", () => {
    expect(parseExclusionLine("  We don't sell machines  ")?.source).toBe(
      "We don't sell machines",
    );
  });

  it("returns null for a line naming no commercial role", () => {
    // Must produce NO verdicts rather than a guessed one: a false
    // wrong-customer hides a keyword the client actually wanted.
    expect(parseExclusionLine("we are closed on sundays")).toBeNull();
  });

  it("returns null for an empty line", () => {
    expect(parseExclusionLine("   ")).toBeNull();
  });

  it("parses a role with no object", () => {
    const parsed = parseExclusionLine("we are not hiring");
    expect(parsed?.family.id).toBe("employment");
    expect(parsed?.object).toBeNull();
  });
});

describe("parseExclusions", () => {
  it("splits on newlines and drops unparseable lines", () => {
    const parsed = parseExclusions(
      "We don't sell machines\nwe love our customers\nwe are not hiring",
    );
    expect(parsed.map((entry) => entry.family.id)).toEqual([
      "purchase",
      "employment",
    ]);
  });
});

describe("classifyKeyword", () => {
  it("flags the keyword this whole feature exists for", () => {
    const result = classifyKeyword("vending machines for sale dfw", DELIOTX);
    expect(result.verdict).toBe("wrong-customer");
    expect(result.reason).toContain("purchase search");
    expect(result.reason).toContain("We don't sell machines");
  });

  it("flags the singular form too", () => {
    expect(classifyKeyword("buy vending machine dfw", DELIOTX).verdict).toBe(
      "wrong-customer",
    );
  });

  it("flags an owner-side search for used equipment", () => {
    expect(
      classifyKeyword("used vending machines for sale by owner dfw", DELIOTX)
        .verdict,
    ).toBe("wrong-customer");
  });

  it("keeps the client's own service keywords on-offer", () => {
    const result = classifyKeyword("office coffee service dallas", DELIOTX);
    expect(result.verdict).toBe("on-offer");
    // Reports the first offer term it matched, so the user can see WHY.
    expect(result.reason).toContain("service");
  });

  it("keeps a bare service keyword on-offer", () => {
    expect(classifyKeyword("vending service dfw", DELIOTX).verdict).toBe(
      "on-offer",
    );
  });

  it("does NOT flag a service price search on the weak 'price' surface", () => {
    // The failure mode that would make this feature worse than nothing:
    // demoting the client's best commercial keyword. "price" is weak, and
    // this keyword never names the excluded object.
    const result = classifyKeyword("vending service price dfw", DELIOTX);
    expect(result.verdict).not.toBe("wrong-customer");
  });

  it("DOES flag a price search that names the excluded object", () => {
    expect(classifyKeyword("vending machine price dfw", DELIOTX).verdict).toBe(
      "wrong-customer",
    );
  });

  it("does not let a strong surface flag an unrelated object", () => {
    // "we don't sell machines" must not swallow a coffee keyword just
    // because the phrase "for sale" appears somewhere in it.
    expect(
      classifyKeyword("office coffee for sale dallas", DELIOTX).verdict,
    ).not.toBe("wrong-customer");
  });

  it("falls back to adjacent for an unexcluded, off-offer keyword", () => {
    const result = classifyKeyword("break room ideas", DELIOTX);
    expect(result.verdict).toBe("adjacent");
  });

  it("applies a role-only exclusion via strong surfaces alone", () => {
    const profile = {
      offer: "vending service",
      exclusions: "we are not hiring",
    };
    expect(
      classifyKeyword("vending machine jobs dallas", profile).verdict,
    ).toBe("wrong-customer");
  });

  it("ignores an exclusion line that names no role", () => {
    // The line parses to nothing, so it must not flag anything -- the
    // keyword falls through to the ordinary offer match on "vending".
    const profile = {
      offer: "vending service",
      exclusions: "we are closed on sundays",
    };
    expect(
      classifyKeyword("vending machines for sale", profile).verdict,
    ).not.toBe("wrong-customer");
  });

  it("prefers the exclusion when a keyword matches both offer and exclusion", () => {
    // "vending" is in the offer AND this is a purchase search. The whole
    // point is that topic overlap must not rescue a wrong-customer keyword.
    expect(
      classifyKeyword("vending machines for sale dfw", DELIOTX).verdict,
    ).toBe("wrong-customer");
  });
});

describe("offerTerms", () => {
  it("drops filler and short words", () => {
    expect(offerTerms("We place and service vending machines")).toEqual([
      "place",
      "service",
      "vending",
      "machine",
    ]);
  });
});

describe("hasUsableProfile", () => {
  it("is false for an empty profile", () => {
    expect(hasUsableProfile({ offer: "", exclusions: "" })).toBe(false);
  });

  it("is false when nothing parses", () => {
    expect(
      hasUsableProfile({ offer: "we do", exclusions: "we are nice" }),
    ).toBe(false);
  });

  it("is true with only an offer", () => {
    expect(hasUsableProfile({ offer: "vending service", exclusions: "" })).toBe(
      true,
    );
  });

  it("is true with only a parseable exclusion", () => {
    expect(
      hasUsableProfile({ offer: "", exclusions: "we don't sell machines" }),
    ).toBe(true);
  });
});
