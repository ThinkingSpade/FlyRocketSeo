import { ItemsGoogleBusinessInfo, RatingInfo } from "dataforseo-client";
import { describe, expect, it, vi } from "vitest";

// LocalSeoService.ts imports r2-cache.ts, which reads Cloudflare Workers'
// `env` at module load time -- outside the Workers runtime (this is a plain
// Node vitest environment) that import throws before a single test can run,
// even though mapBusinessProfile itself never touches the cache. Same
// pattern as RankTrackingService.test.ts / brandLookup.test.ts. vi.mock is
// hoisted above the import below, so this is safe despite the ordering.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { mapBusinessProfile } from "./LocalSeoService";

const FETCHED_AT = "2026-01-01T00:00:00.000Z";

/** Finding 3's failing input verbatim: DataForSEO returns a category but
 *  simply omits `additional_categories` (as it does for a real business
 *  that has no additional categories on record) rather than sending `[]`.
 *  Constructed via the real SDK class (not a cast) so this only exercises
 *  what production actually hands `mapBusinessProfile`. */
const ITEM_WITHOUT_ADDITIONAL_CATEGORIES = new ItemsGoogleBusinessInfo({
  category: "Plumber",
});

describe("mapBusinessProfile - additionalCategories null-vs-empty", () => {
  it("does not turn invalid numeric profile evidence into ratings, counts or coordinates", () => {
    const item = new ItemsGoogleBusinessInfo({
      rating: new RatingInfo({ value: 8, votes_count: 1.5 }),
      latitude: 91,
      longitude: -181,
    });
    expect(mapBusinessProfile(item, FETCHED_AT)).toMatchObject({
      rating: null,
      reviewsCount: null,
      latitude: null,
      longitude: null,
    });
  });

  it("preserves actual zero reviews and fractional valid five-star ratings", () => {
    const item = new ItemsGoogleBusinessInfo({
      rating: new RatingInfo({ value: 4.25, votes_count: 0 }),
      latitude: 0,
      longitude: 0,
    });
    expect(mapBusinessProfile(item, FETCHED_AT)).toMatchObject({
      rating: 4.25,
      reviewsCount: 0,
      latitude: 0,
      longitude: 0,
    });
  });
  it("maps an unreturned additional_categories field to null, not an empty array", () => {
    const profile = mapBusinessProfile(
      ITEM_WITHOUT_ADDITIONAL_CATEGORIES,
      FETCHED_AT,
    );
    // Before this fix, `?? []` made this indistinguishable from a business
    // that genuinely has zero additional categories -- gbpAudit.ts would
    // then confidently advise adding some it can't actually confirm are
    // missing.
    expect(profile.additionalCategories).toBeNull();
  });

  it("preserves a genuinely empty additional_categories array", () => {
    const item = new ItemsGoogleBusinessInfo({
      category: "Plumber",
      additional_categories: [],
    });
    const profile = mapBusinessProfile(item, FETCHED_AT);
    expect(profile.additionalCategories).toEqual([]);
  });

  it("preserves a non-empty additional_categories array", () => {
    const item = new ItemsGoogleBusinessInfo({
      category: "Plumber",
      additional_categories: ["Emergency plumber"],
    });
    const profile = mapBusinessProfile(item, FETCHED_AT);
    expect(profile.additionalCategories).toEqual(["Emergency plumber"]);
  });

  it("maps a not-found result to null rather than an empty array", () => {
    const profile = mapBusinessProfile(null, FETCHED_AT);
    expect(profile.found).toBe(false);
    expect(profile.additionalCategories).toBeNull();
  });
});
