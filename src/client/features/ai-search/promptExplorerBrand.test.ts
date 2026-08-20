import { describe, expect, it } from "vitest";

import { defaultHighlightBrand } from "./promptExplorerBrand";
import { EMPTY_PROFILE } from "@/shared/keyword-fit/profileTypes";

const project = { name: "Delio TX", domain: "deliotx.com" };
const confirmed = (brandTerms: string) => ({
  ...EMPTY_PROFILE,
  brandTerms,
  confirmedAt: "2026-08-01T00:00:00.000Z",
});

/**
 * This string is the whole tab's measurement: the server turns it into
 * /\b<brand>\b/i and scores every model's answer against it, so what it
 * defaults to decides whether a real mention is reported as one.
 */
describe("defaultHighlightBrand", () => {
  it("uses a confirmed profile's curated brand name", () => {
    expect(defaultHighlightBrand(confirmed("Delio TX Vending"), project)).toBe(
      "delio tx vending",
    );
  });

  it("prefers the project name over the domain stem", () => {
    // The regression: `resolveBrandTerms` unions the domain stem in, so asking
    // it for a default WITH the domain always answered `deliotx` -- and
    // /\bdeliotx\b/i does not match "Delio TX" in an answer's prose, which is
    // the false negative the curated brand field exists to prevent.
    expect(defaultHighlightBrand(EMPTY_PROFILE, project)).toBe("Delio TX");
  });

  it("prefers the project name when a confirmed profile has no brand names", () => {
    // The ordinary state once the profile is confirmed but "Brand names" was
    // left blank -- the stem must not sneak back in through the curated slot.
    expect(defaultHighlightBrand(confirmed(""), project)).toBe("Delio TX");
    expect(defaultHighlightBrand(confirmed("   \n  "), project)).toBe(
      "Delio TX",
    );
  });

  it("ignores an unconfirmed AI draft's brand names", () => {
    // Auto-drafting makes "unconfirmed profile" the common state, and a
    // hallucinated brand term would silently be what answers are scored on.
    const draft = {
      ...EMPTY_PROFILE,
      source: "ai" as const,
      brandTerms: "Invented Co",
    };
    expect(defaultHighlightBrand(draft, project)).toBe("Delio TX");
  });

  it("falls back to the domain stem only when there is no usable name", () => {
    expect(
      defaultHighlightBrand(EMPTY_PROFILE, { ...project, name: "  " }),
    ).toBe("deliotx");
    // "Default" is onboarding's placeholder, not a brand.
    expect(
      defaultHighlightBrand(EMPTY_PROFILE, { ...project, name: "Default" }),
    ).toBe("deliotx");
  });

  it("is empty when the project is not loaded yet", () => {
    expect(defaultHighlightBrand(EMPTY_PROFILE, null)).toBe("");
    expect(
      defaultHighlightBrand(EMPTY_PROFILE, { name: "", domain: null }),
    ).toBe("");
  });
});
