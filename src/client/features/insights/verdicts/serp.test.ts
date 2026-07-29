import { describe, expect, it } from "vitest";
import { buildSerpVerdict, serpRowNote } from "./serp";

describe("buildSerpVerdict", () => {
  it("says so when there is no domain-rating data to judge with", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: null,
      competitorRatings: [],
      resultCount: 0,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
  });

  it("calls a keyword reachable when the field is no stronger than the site", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 40,
      competitorRatings: [20, 25, 30],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toContain("25");
  });

  it("calls a keyword out of reach when the field is far stronger", () => {
    const verdict = buildSerpVerdict({
      keyword: "coffee",
      ownDomainRating: 12,
      competitorRatings: [70, 80, 90],
      resultCount: 10,
      paaQuestions: ["what is the best office coffee"],
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toContain("12");
    expect(verdict.actions[0].label).toContain(
      "what is the best office coffee",
    );
  });

  it("calls a close contest 'mixed' when the gap is inside the band", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 40,
      competitorRatings: [35, 42, 44],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "The top results have a median DR of 42 against your DR 40 — close enough that authority is unlikely to decide this one. Effort is better spent on the page itself.",
    );
    expect(verdict.actions[0].label).toContain("Match the top result's depth");
  });

  it("falls back to a longer-tail suggestion when there are no PAA questions", () => {
    const verdict = buildSerpVerdict({
      keyword: "coffee",
      ownDomainRating: 12,
      competitorRatings: [70, 80, 90],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.actions[0].label).toBe(
      "Target a longer-tail variant of this keyword",
    );
    expect(verdict.actions[0].evidence).toBe(
      "A DR 12 site does not out-rank a DR 80 field head-on",
    );
  });

  it("medians an even-length field by averaging the two middle ratings", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 40,
      // sorted [20, 30, 50, 60] -> middle two are 30 and 50 -> median 40,
      // a value that appears nowhere in the input, proving this averaged
      // the pair rather than picking one of the four ratings.
      competitorRatings: [20, 30, 50, 60],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toContain("median DR of 40");
  });

  it("calls a verdict comfortably above the evidence floor (5 rated results)", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 12,
      competitorRatings: [70, 75, 80, 85, 90],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toContain("median DR of 80");
  });

  it("calls a verdict right at the evidence floor (3 rated results)", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 30,
      competitorRatings: [28, 30, 32],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "The top results have a median DR of 30 against your DR 30 — close enough that authority is unlikely to decide this one. Effort is better spent on the page itself.",
    );
  });

  it("declines to call it below the evidence floor (2 rated results)", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 30,
      competitorRatings: [28, 32],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "Only 2 of 10 results in this SERP have a known domain rating — too thin a sample to call this field's authority level.",
    );
  });

  it("declines to call it when no result has a known rating at all", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 30,
      competitorRatings: [],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "None of the 10 results in this SERP have a known domain rating, so there is nothing to measure the field's authority against.",
    );
  });
});

describe("buildSerpVerdict area labeling (Task 6)", () => {
  it("prefixes the read with the area when the SERP was locally scoped", () => {
    const verdict = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 40,
      competitorRatings: [35, 42, 44],
      resultCount: 10,
      paaQuestions: [],
      areaLabel: "Dallas-Ft. Worth, TX",
    });

    expect(verdict.read).toBe(
      "In Dallas-Ft. Worth, TX, the top results have a median DR of 42 against your DR 40 — close enough that authority is unlikely to decide this one. Effort is better spent on the page itself.",
    );
  });

  it("says nothing extra for a national result -- identical to omitting the field", () => {
    const withNull = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 40,
      competitorRatings: [35, 42, 44],
      resultCount: 10,
      paaQuestions: [],
      areaLabel: null,
    });
    const omitted = buildSerpVerdict({
      keyword: "office coffee",
      ownDomainRating: 40,
      competitorRatings: [35, 42, 44],
      resultCount: 10,
      paaQuestions: [],
    });

    expect(withNull.read).toBe(omitted.read);
    expect(withNull.read.startsWith("In ")).toBe(false);
  });
});

describe("serpRowNote", () => {
  it("states the gap for a result stronger than the site", () => {
    expect(serpRowNote({ domainRating: 45 }, { ownDomainRating: 12 })).toBe(
      "needs DR 45+",
    );
  });

  it("says nothing for a result the site already outranks on authority", () => {
    expect(
      serpRowNote({ domainRating: 8 }, { ownDomainRating: 12 }),
    ).toBeNull();
  });

  it("says nothing when either rating is missing", () => {
    expect(
      serpRowNote({ domainRating: null }, { ownDomainRating: 12 }),
    ).toBeNull();
  });
});
