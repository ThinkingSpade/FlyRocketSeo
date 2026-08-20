import { describe, expect, it } from "vitest";
import {
  buildDomainNameCandidates,
  deriveSeedTerms,
} from "@/shared/domainNameCandidates";

const DELIO_KEYWORDS = [
  "breakroom services",
  "office coffee service dallas",
  "office vending machines",
  "vending machines dallas",
  "vending services dallas",
];

describe("deriveSeedTerms", () => {
  it("pulls the industry words out of tracked keywords", () => {
    const terms = deriveSeedTerms(DELIO_KEYWORDS, "");
    expect(terms).toContain("vending");
    expect(terms).toContain("breakroom");
    expect(terms).toContain("coffee");
  });

  // "services", "machines" and the like appear in every keyword and generate
  // nothing but noise when combined -- "servicesdirect.com" is not this
  // client's industry.
  it("drops generic filler words", () => {
    const terms = deriveSeedTerms(DELIO_KEYWORDS, "");
    expect(terms).not.toContain("services");
    expect(terms).not.toContain("service");
    expect(terms).not.toContain("machines");
  });

  it("keeps a location term, which is how local operators name domains", () => {
    expect(deriveSeedTerms(DELIO_KEYWORDS, "")).toContain("dallas");
  });

  it("also reads the business profile when one exists", () => {
    const terms = deriveSeedTerms([], "micromarket and pantry supply");
    expect(terms).toContain("micromarket");
    expect(terms).toContain("pantry");
  });

  it("returns nothing when there is nothing to read", () => {
    expect(deriveSeedTerms([], "")).toEqual([]);
  });
});

describe("buildDomainNameCandidates", () => {
  const base = {
    heads: ["vending", "breakroom"],
    adjacents: ["snack", "nutrition"],
    modifiers: ["supply", "hub"],
    tlds: ["com"],
    exclude: [],
    limit: 100,
  };

  it("combines industry and adjacent words into plausible names", () => {
    const names = buildDomainNameCandidates(base);
    expect(names).toContain("snackvending.com");
    expect(names).toContain("nutritionvending.com");
    expect(names).toContain("vendingsupply.com");
  });

  // The entire point: reach beyond the client's own vertical.
  it("produces adjacent-only names, not just head-word ones", () => {
    const names = buildDomainNameCandidates(base);
    expect(names).toContain("nutritionhub.com");
  });

  it("never suggests the project's own domain or a known competitor", () => {
    const names = buildDomainNameCandidates({
      ...base,
      exclude: ["snackvending.com", "VendingSupply.com"],
    });
    expect(names).not.toContain("snackvending.com");
    // Exclusion is case-insensitive; a competitor list is user-typed.
    expect(names).not.toContain("vendingsupply.com");
  });

  it("emits every requested tld", () => {
    const names = buildDomainNameCandidates({ ...base, tlds: ["com", "net"] });
    expect(names).toContain("snackvending.com");
    expect(names).toContain("snackvending.net");
  });

  it("dedupes and respects the limit, because each name may cost credits", () => {
    const names = buildDomainNameCandidates({ ...base, limit: 5 });
    expect(names).toHaveLength(5);
    expect(new Set(names).size).toBe(5);
  });

  it("strips characters that cannot appear in a hostname", () => {
    const names = buildDomainNameCandidates({
      ...base,
      heads: ["micro market"],
      adjacents: ["co-fee!"],
      modifiers: [],
      limit: 20,
    });
    expect(names.every((name) => /^[a-z0-9]+\.[a-z]+$/.test(name))).toBe(true);
  });

  it("returns nothing when there are no seed terms", () => {
    expect(
      buildDomainNameCandidates({ ...base, heads: [], adjacents: [] }),
    ).toEqual([]);
  });
});
