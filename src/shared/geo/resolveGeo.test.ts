import { describe, expect, it } from "vitest";
import { resolveGeo } from "./resolveGeo";
import type { TargetArea } from "./types";

const US = { locationCode: 2840, languageCode: "en" };
const UK = { locationCode: 2826, languageCode: "en" };

const DFW: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: 2840,
};

describe("resolveGeo without a target area", () => {
  it("keeps keyword volume national", () => {
    // Full tuple, not just locationCode/scope: a wrong provider or label
    // here would previously slip past this test entirely (Finding 7).
    expect(resolveGeo("keyword-volume", null, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
      label: "United States",
    });
  });

  it("keeps the SERP national", () => {
    const geo = resolveGeo("serp", null, US);
    expect(geo).toMatchObject({
      locationCode: 2840,
      provider: "serp",
      scope: "national",
      label: "United States",
    });
  });
});

describe("resolveGeo label without a target area", () => {
  // No target area means every one of these needs falls back to describing
  // the whole session country, so the label must be that country's own
  // name — never a different, hardcoded country. Pinned per-need because
  // the fix touches three separate branches (local-pack, the NATIONAL_ONLY
  // branch, and the generic national branch) that must each get it right.
  it("labels keyword volume with the US session's own country name", () => {
    expect(resolveGeo("keyword-volume", null, US).label).toBe("United States");
  });

  it("labels keyword difficulty with the US session's own country name", () => {
    expect(resolveGeo("keyword-difficulty", null, US).label).toBe(
      "United States",
    );
  });

  it("labels the SERP need with the US session's own country name", () => {
    expect(resolveGeo("serp", null, US).label).toBe("United States");
  });

  it("labels the local pack with the US session's own country name", () => {
    expect(resolveGeo("local-pack", null, US).label).toBe("United States");
  });

  it("labels keyword volume with the UK session's own country name, not a hardcoded US default", () => {
    expect(resolveGeo("keyword-volume", null, UK).label).toBe("United Kingdom");
  });

  it("labels keyword difficulty with the UK session's own country name, not a hardcoded US default", () => {
    expect(resolveGeo("keyword-difficulty", null, UK).label).toBe(
      "United Kingdom",
    );
  });

  it("labels the SERP need with the UK session's own country name, not a hardcoded US default", () => {
    expect(resolveGeo("serp", null, UK).label).toBe("United Kingdom");
  });

  it("labels the local pack with the UK session's own country name, not the hardcoded United States", () => {
    // Verified live: a UK session (locationCode 2826) with no target area
    // returned label: "United States" while locationCode was correctly
    // 2826 — the label contradicted the code it shipped alongside.
    expect(resolveGeo("local-pack", null, UK).label).toBe("United Kingdom");
  });

  it("labels every no-area need empty, without throwing, for an unrecognised session country", () => {
    const UNRECOGNISED = { locationCode: 999_999, languageCode: "en" };
    expect(resolveGeo("keyword-volume", null, UNRECOGNISED).label).toBe("");
    expect(resolveGeo("keyword-difficulty", null, UNRECOGNISED).label).toBe("");
    expect(resolveGeo("serp", null, UNRECOGNISED).label).toBe("");
    expect(resolveGeo("local-pack", null, UNRECOGNISED).label).toBe("");
  });
});

describe("resolveGeo with a metro target area", () => {
  it("takes keyword volume local, via Google Ads", () => {
    expect(resolveGeo("keyword-volume", DFW, US)).toMatchObject({
      locationCode: 200623,
      provider: "google_ads",
      scope: "local",
      label: "Dallas-Ft. Worth, TX",
    });
  });

  it("keeps difficulty national, because Labs is country-only", () => {
    expect(resolveGeo("keyword-difficulty", DFW, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
      label: "United States",
    });
  });

  it("keeps intent national for the same reason", () => {
    // Full tuple (Finding 7): a single `.scope` check would still pass for a
    // result that quietly returned the wrong locationCode, provider or label.
    expect(resolveGeo("search-intent", DFW, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
      label: "United States",
    });
  });

  it("takes the SERP local", () => {
    expect(resolveGeo("serp", DFW, US)).toMatchObject({
      locationCode: 200623,
      provider: "serp",
      scope: "local",
      label: "Dallas-Ft. Worth, TX",
    });
  });

  it("takes rank tracking local", () => {
    // Full tuple (Finding 7): the brief's own example — a DFW rank-tracking
    // result with locationCode 200623 but provider "labs"/scope
    // "national"/label "United States" — would still have passed the old
    // locationCode-only assertion below.
    expect(resolveGeo("rank-tracking", DFW, US)).toMatchObject({
      locationCode: 200623,
      provider: "serp",
      scope: "local",
      label: "Dallas-Ft. Worth, TX",
    });
  });

  it("keeps domain analytics national", () => {
    expect(resolveGeo("domain-analytics", DFW, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
      label: "United States",
    });
  });

  it("routes the local pack to the business provider", () => {
    expect(resolveGeo("local-pack", DFW, US)).toMatchObject({
      locationCode: 200623,
      provider: "business",
      scope: "local",
    });
  });

  it("still labels the local pack with the metro's own name, not the country's", () => {
    // Guards the fix above the other way: giving the no-area case a real
    // country label must not clobber the has-area case's own label.
    expect(resolveGeo("local-pack", DFW, US).label).toBe(
      "Dallas-Ft. Worth, TX",
    );
  });

  it("resolves the parent country, not the session country, for national needs", () => {
    const ukMetro: TargetArea = {
      kind: "metro",
      locationCode: 9041110,
      label: "Greater London",
      parentCountryCode: 2826,
    };
    // Full tuple (Finding 7): pins provider/scope/label alongside
    // locationCode so a future regression can't hide behind a single field.
    expect(resolveGeo("keyword-difficulty", ukMetro, US)).toMatchObject({
      locationCode: 2826,
      provider: "labs",
      scope: "national",
      label: "United Kingdom",
    });
  });
});

describe("resolveGeo with a country target area", () => {
  it("treats an explicit country area as national, not local", () => {
    const area: TargetArea = {
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    };
    // Full tuple (Finding 7): an explicit country area must resolve
    // identically to "no area at all" for the same country, not merely
    // share its scope.
    expect(resolveGeo("keyword-volume", area, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
      label: "United States",
    });
  });
});

describe("resolveGeo national-only availability for Google-Ads-only countries", () => {
  // Labs is the sole source of keyword difficulty, search intent and domain
  // analytics. For a Google-Ads-only country (no Labs coverage at all),
  // there is no fallback source for these three — unlike keyword-volume/SERP,
  // which Google Ads/the SERP API still serve. Before this fix, these needs
  // unconditionally claimed `provider: "labs"` even here, advertising a
  // provider that cannot actually produce the figure.
  const ICELAND = { locationCode: 2352, languageCode: "is" };

  it("reports unavailable, not labs, for keyword difficulty in a Google-Ads-only session country", () => {
    // The exact failing input from the review: Iceland has no target area,
    // so this exercises the no-area branch of NATIONAL_ONLY directly.
    expect(resolveGeo("keyword-difficulty", null, ICELAND)).toMatchObject({
      locationCode: 2352,
      languageCode: "is",
      provider: "none",
      scope: "national",
      label: "Iceland",
    });
  });

  it("reports unavailable for search intent and domain analytics too", () => {
    expect(resolveGeo("search-intent", null, ICELAND).provider).toBe("none");
    expect(resolveGeo("domain-analytics", null, ICELAND).provider).toBe("none");
  });

  it("still reports labs for a Labs-covered country, so unavailability is specific to Google-Ads-only ones", () => {
    expect(resolveGeo("keyword-difficulty", null, US).provider).toBe("labs");
  });

  it("reports unavailable when a target area's PARENT country is Google-Ads-only, not just the bare session", () => {
    // A city inside a Google-Ads-only country: NATIONAL_ONLY must resolve
    // unavailability from the area's parent country, the same place it
    // already reads locationCode/label from — not from the (irrelevant)
    // session country.
    const reykjavikCity: TargetArea = {
      kind: "city",
      locationCode: 1_005_555, // placeholder city code; only the branching matters here
      label: "Reykjavik",
      parentCountryCode: 2352,
    };
    expect(resolveGeo("keyword-difficulty", reykjavikCity, US)).toMatchObject({
      locationCode: 2352,
      provider: "none",
      scope: "national",
      label: "Iceland",
    });
  });
});

describe("resolveGeo language selection when the target area's country differs from the session", () => {
  it("uses the area's own country language, not the session's, for a national-only need", () => {
    // The exact failing input from the review: a Paris (France) target area
    // under a US/"en" session must resolve keyword-difficulty to France's
    // own configured language ("fr"), not the session's "en".
    const paris: TargetArea = {
      kind: "city",
      locationCode: 1006932,
      label: "Paris, FR",
      parentCountryCode: 2250,
    };
    expect(resolveGeo("keyword-difficulty", paris, US)).toMatchObject({
      locationCode: 2250,
      languageCode: "fr",
      provider: "labs",
      scope: "national",
      label: "France",
    });
  });

  it("also switches the language for a LOCAL sub-country figure, not just national ones", () => {
    // Local needs (keyword-volume here) keep the area's own locationCode
    // (Paris, not France), but the language pair must still be the area's
    // country's language — Google Ads/SERP take (location, language) as one
    // pair regardless of which level the location is at.
    const paris: TargetArea = {
      kind: "city",
      locationCode: 1006932,
      label: "Paris, FR",
      parentCountryCode: 2250,
    };
    expect(resolveGeo("keyword-volume", paris, US)).toMatchObject({
      locationCode: 1006932,
      languageCode: "fr",
      provider: "google_ads",
      scope: "local",
      label: "Paris, FR",
    });
  });

  it("switches the language for an explicit country-kind area too", () => {
    const france: TargetArea = {
      kind: "country",
      locationCode: 2250,
      label: "France",
      parentCountryCode: 2250,
    };
    expect(resolveGeo("keyword-volume", france, US)).toMatchObject({
      locationCode: 2250,
      languageCode: "fr",
      provider: "labs",
      scope: "national",
    });
  });

  it("keeps the session's own language when the resolved country is unchanged", () => {
    // Control for the fix above: a project can legitimately run its own
    // country in a non-default language (US session set to Spanish). With no
    // target area, the resolved country IS the session country, so this must
    // NOT be reset to LOCATION_OPTIONS' US default ("en").
    const usInSpanish = { locationCode: 2840, languageCode: "es" };
    expect(resolveGeo("keyword-volume", null, usInSpanish).languageCode).toBe(
      "es",
    );
    expect(
      resolveGeo("keyword-difficulty", null, usInSpanish).languageCode,
    ).toBe("es");
  });

  it("keeps the session's own language for a same-country target area", () => {
    const dfw: TargetArea = {
      kind: "metro",
      locationCode: 200623,
      label: "Dallas-Ft. Worth, TX",
      parentCountryCode: 2840,
    };
    const usInSpanish = { locationCode: 2840, languageCode: "es" };
    expect(resolveGeo("keyword-volume", dfw, usInSpanish).languageCode).toBe(
      "es",
    );
  });
});
