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
