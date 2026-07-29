import { describe, expect, it } from "vitest";
import { applyServiceAreaToSeeds, toSearchablePlace } from "./seedGeo";

const PHRASES = ["office coffee service", "vending service"];

describe("toSearchablePlace", () => {
  it("reduces a seeded metro label to the city a searcher types", () => {
    expect(toSearchablePlace("Dallas-Ft. Worth, TX")).toBe("dallas");
  });

  it("reduces a seeded city label to the city", () => {
    expect(toSearchablePlace("Miami, Florida")).toBe("miami");
  });

  it("passes a bare city through", () => {
    expect(toSearchablePlace("Austin")).toBe("austin");
  });

  it("returns an empty string for an empty label", () => {
    expect(toSearchablePlace("")).toBe("");
  });
});

describe("applyServiceAreaToSeeds", () => {
  it("localizes and keeps the bare phrase for a local business", () => {
    expect(
      applyServiceAreaToSeeds(PHRASES, "local", "Dallas-Ft. Worth, TX"),
    ).toEqual([
      "office coffee service dallas",
      "office coffee service",
      "vending service dallas",
      "vending service",
    ]);
  });

  it("treats regional the same as local", () => {
    expect(
      applyServiceAreaToSeeds(
        ["vending service"],
        "regional",
        "Miami, Florida",
      ),
    ).toEqual(["vending service miami", "vending service"]);
  });

  it("leaves a national business's phrases unmodified", () => {
    expect(
      applyServiceAreaToSeeds(PHRASES, "national", "Dallas-Ft. Worth, TX"),
    ).toEqual(PHRASES);
  });

  it("leaves a global business's phrases unmodified", () => {
    // The city is noise for a business whose buyers are anywhere -- this is
    // the case that makes serviceAreaKind worth storing at all.
    expect(
      applyServiceAreaToSeeds(PHRASES, "global", "Miami, Florida"),
    ).toEqual(PHRASES);
  });

  it("falls back to unmodified when there is no target area", () => {
    expect(applyServiceAreaToSeeds(PHRASES, "local", null)).toEqual(PHRASES);
  });

  it("does not double up a phrase the model already localized", () => {
    expect(
      applyServiceAreaToSeeds(
        ["vending service dallas"],
        "local",
        "Dallas-Ft. Worth, TX",
      ),
    ).toEqual(["vending service dallas"]);
  });

  it("de-duplicates and drops blank phrases", () => {
    expect(
      applyServiceAreaToSeeds(
        ["Vending Service", "vending service", "  "],
        "national",
        null,
      ),
    ).toEqual(["vending service"]);
  });
});
