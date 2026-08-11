import { describe, expect, it } from "vitest";
import { ahrefsRatingFromValue } from "./ahrefsRating";

describe("ahrefsRatingFromValue", () => {
  it("keeps a DR of 0 as a rating, not an absence", () => {
    // The regression this file exists for. americavending.com rates 0, and
    // collapsing that to null told Keyword Research the project's authority
    // was UNKNOWN, which switched off the winnable/stretch/not-yet verdict
    // entirely. 0 is the most decisive input that verdict can get.
    expect(ahrefsRatingFromValue(0)).toBe(0);
  });

  it("keeps ordinary ratings verbatim", () => {
    expect(ahrefsRatingFromValue(7)).toBe(7);
    expect(ahrefsRatingFromValue(91.5)).toBe(91.5);
  });

  it.each([
    ["absent", undefined],
    ["explicitly null", null],
    ["a string", "42"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["an object", { domain_rating: 5 }],
  ])("returns null for %s — the only thing null may mean", (_label, value) => {
    expect(ahrefsRatingFromValue(value)).toBeNull();
  });
});
