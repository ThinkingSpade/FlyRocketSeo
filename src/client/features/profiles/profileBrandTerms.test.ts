import { describe, expect, it } from "vitest";

import { resolveBrandTerms } from "./profileBrandTerms";
import { EMPTY_PROFILE } from "@/shared/keyword-fit/profileTypes";

const confirmed = (brandTerms: string) => ({
  ...EMPTY_PROFILE,
  brandTerms,
  confirmedAt: "2026-08-01T00:00:00.000Z",
});

/**
 * The profile has had a "Brand names" field since it was built and nothing
 * read it: branded-query detection derived its terms from the domain stem
 * alone. A client whose brand is not their domain had every branded search
 * counted as non-branded.
 */
describe("resolveBrandTerms", () => {
  it("reads the spellings a domain cannot tell you", () => {
    const terms = resolveBrandTerms(
      confirmed("Delio TX\nDelio Vending"),
      "deliotx.com",
    );
    expect(terms).toContain("delio tx");
    expect(terms).toContain("delio vending");
  });

  it("keeps the domain stem as well, so a sparse profile never loses ground", () => {
    const terms = resolveBrandTerms(confirmed("Delio TX"), "deliotx.com");
    expect(terms).toContain("deliotx");
  });

  it("ignores an unconfirmed draft's brand terms", () => {
    // A hallucinated brand term would silently reclassify real non-branded
    // demand as the client's own traffic, which is a number they report on.
    const terms = resolveBrandTerms(
      { ...EMPTY_PROFILE, source: "ai", brandTerms: "Invented Brand" },
      "deliotx.com",
    );
    expect(terms).toEqual(["deliotx"]);
  });

  it("falls back to the domain alone when the field is empty", () => {
    expect(resolveBrandTerms(confirmed(""), "deliotx.com")).toEqual([
      "deliotx",
    ]);
  });

  it("does not duplicate a term the domain already supplies", () => {
    const terms = resolveBrandTerms(confirmed("deliotx"), "deliotx.com");
    expect(terms).toEqual(["deliotx"]);
  });

  it("returns nothing when there is neither a profile nor a domain", () => {
    expect(resolveBrandTerms(EMPTY_PROFILE, null)).toEqual([]);
  });
});
