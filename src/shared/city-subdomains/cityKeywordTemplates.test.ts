import { describe, expect, it } from "vitest";
import { estimateRankCheckCredits } from "@/shared/rank-tracking";
import {
  checksPerMonth,
  expandCityKeywords,
  parseKeywordTemplates,
  projectCityRankCost,
  usesCityToken,
} from "./cityKeywordTemplates";

const AUSTIN = { city: "Austin", stateCode: "TX" };

describe("expandCityKeywords", () => {
  it("substitutes the city and state tokens", () => {
    expect(
      expandCityKeywords(["plumber {city}", "{city} {state} plumber"], AUSTIN),
    ).toEqual(["plumber austin", "austin tx plumber"]);
  });

  it("is case-insensitive about the token spelling", () => {
    expect(expandCityKeywords(["plumber {CITY}"], AUSTIN)).toEqual([
      "plumber austin",
    ]);
  });

  it("keeps a template with no token, which the location code localizes", () => {
    expect(expandCityKeywords(["emergency plumber"], AUSTIN)).toEqual([
      "emergency plumber",
    ]);
  });

  /**
   * The failure this guards: sending the literal string "{state}" to a paid
   * SERP API once per check, for every city that has no state code.
   */
  it("drops the state token, and its stray spacing, when there is no state", () => {
    expect(
      expandCityKeywords(["plumber {city} {state}"], {
        city: "Springfield",
        stateCode: null,
      }),
    ).toEqual(["plumber springfield"]);
  });

  it("lowercases and dedupes, matching what gets stored", () => {
    expect(
      expandCityKeywords(["Plumber {city}", "plumber {city}"], AUSTIN),
    ).toEqual(["plumber austin"]);
  });

  it("drops a template that expands to nothing", () => {
    expect(
      expandCityKeywords(["{state}", "plumber"], {
        city: "Springfield",
        stateCode: null,
      }),
    ).toEqual(["plumber"]);
  });
});

describe("usesCityToken", () => {
  it("recognises the token in any case", () => {
    expect(usesCityToken("plumber {City}")).toBe(true);
  });

  it("is false for a template without it", () => {
    expect(usesCityToken("plumber near me")).toBe(false);
  });

  /**
   * A shared global regex carries `lastIndex` between calls, so the same input
   * would alternate true/false. This asserts the answer is stable.
   */
  it("gives the same answer when asked repeatedly", () => {
    expect(usesCityToken("plumber {city}")).toBe(true);
    expect(usesCityToken("plumber {city}")).toBe(true);
    expect(usesCityToken("plumber {city}")).toBe(true);
  });
});

describe("parseKeywordTemplates", () => {
  it("takes one template per line, dropping blanks and duplicates", () => {
    expect(
      parseKeywordTemplates("plumber {city}\n\n  \nplumber {city}\nhvac"),
    ).toEqual(["plumber {city}", "hvac"]);
  });
});

describe("checksPerMonth", () => {
  it("uses real weeks per month rather than four", () => {
    // Four would understate a weekly schedule by about 8%.
    expect(checksPerMonth("weekly")).toBeCloseTo(4.345, 2);
  });

  it("counts a daily schedule as an average month of days", () => {
    expect(checksPerMonth("daily")).toBeCloseTo(30.4, 1);
  });

  it("is one for monthly and zero for manual", () => {
    expect(checksPerMonth("monthly")).toBe(1);
    expect(checksPerMonth("manual")).toBe(0);
  });
});

describe("projectCityRankCost", () => {
  it("scales the shared per-config estimate by the number of cities", () => {
    const projection = projectCityRankCost({
      cityCount: 100,
      keywordsPerCity: 5,
      devices: "both",
      serpDepth: 100,
      interval: "weekly",
    });

    const perCity = estimateRankCheckCredits(5, "both", 100, "queued");
    expect(projection.costPerCheckUsd).toBeCloseTo(perCity.costUsd * 100, 10);
  });

  it("counts one request per keyword per device", () => {
    expect(
      projectCityRankCost({
        cityCount: 10,
        keywordsPerCity: 5,
        devices: "both",
        serpDepth: 100,
        interval: "weekly",
      }).requestsPerCheck,
    ).toBe(100);

    expect(
      projectCityRankCost({
        cityCount: 10,
        keywordsPerCity: 5,
        devices: "mobile",
        serpDepth: 100,
        interval: "weekly",
      }).requestsPerCheck,
    ).toBe(50);
  });

  /**
   * Scheduled checks go through the cheaper task queue and manual ones through
   * the live endpoint. Quoting one price for the other misstates the bill by
   * roughly 3x in whichever direction.
   */
  it("prices a schedule on the queued endpoint and manual on the live one", () => {
    const base = {
      cityCount: 50,
      keywordsPerCity: 4,
      devices: "both",
      serpDepth: 100,
    } as const;

    const scheduled = projectCityRankCost({ ...base, interval: "weekly" });
    const manual = projectCityRankCost({ ...base, interval: "manual" });

    expect(manual.costPerCheckUsd).toBeGreaterThan(scheduled.costPerCheckUsd);
  });

  it("recurs nothing for a manual schedule", () => {
    expect(
      projectCityRankCost({
        cityCount: 500,
        keywordsPerCity: 20,
        devices: "both",
        serpDepth: 100,
        interval: "manual",
      }).costPerMonthUsd,
    ).toBe(0);
  });

  it("multiplies the per-check cost across a month of scheduled runs", () => {
    const projection = projectCityRankCost({
      cityCount: 10,
      keywordsPerCity: 2,
      devices: "desktop",
      serpDepth: 50,
      interval: "daily",
    });

    expect(projection.costPerMonthUsd).toBeCloseTo(
      projection.costPerCheckUsd * checksPerMonth("daily"),
      10,
    );
  });

  it("costs nothing when no city is selected", () => {
    expect(
      projectCityRankCost({
        cityCount: 0,
        keywordsPerCity: 5,
        devices: "both",
        serpDepth: 100,
        interval: "weekly",
      }),
    ).toMatchObject({ costPerCheckUsd: 0, costPerMonthUsd: 0 });
  });
});
