import { describe, expect, it } from "vitest";

import {
  applyPrefill,
  deriveBrandTerms,
  serviceAreaKindForArea,
} from "./profilePrefill";
import { EMPTY_PROFILE } from "@/shared/keyword-fit/profileTypes";

/**
 * The card asks for things the app already knows.
 *
 * Every value here is derivable from the project record and the target area
 * the banner directly above the card has already detected, so asking the user
 * to type them is asking them to restate their own project. These are the two
 * pure decisions behind that; the card composes them, and nothing is written
 * until the user presses Save.
 */
describe("serviceAreaKindForArea", () => {
  it("treats a city and a metro as one local area", () => {
    // Both mean "seeds should carry a geo modifier", which is the only thing
    // serviceAreaKind decides. A DFW operator and a Dallas operator want the
    // same treatment; the difference between them lives in the target area's
    // own locationCode, not here.
    expect(serviceAreaKindForArea("city")).toBe("local");
    expect(serviceAreaKindForArea("metro")).toBe("local");
  });

  it("treats a region as several areas", () => {
    expect(serviceAreaKindForArea("region")).toBe("regional");
  });

  it("treats a country as nationwide", () => {
    expect(serviceAreaKindForArea("country")).toBe("national");
  });
});

describe("deriveBrandTerms", () => {
  it("uses the project name and the domain's own label", () => {
    expect(
      deriveBrandTerms({ projectName: "Delio TX", domain: "deliotx.com" }),
    ).toBe("Delio TX\ndeliotx");
  });

  it("does not repeat a name that is already the domain label", () => {
    // "Acme" and "acme.com" are one brand, not two. Compared case- and
    // space-insensitively, because a project name is typed by a human.
    expect(deriveBrandTerms({ projectName: "Acme", domain: "acme.com" })).toBe(
      "Acme",
    );
    expect(
      deriveBrandTerms({ projectName: "Delio TX", domain: "deliotx.com" }),
    ).not.toContain("Delio TX\nDelio TX");
  });

  it("drops the auto-created project name, which is not a brand", () => {
    // Projects are created as "Default" before the user names them. Offering
    // that as branded search would make every keyword containing the word
    // "default" read as the client's own brand.
    expect(
      deriveBrandTerms({ projectName: "Default", domain: "deliotx.com" }),
    ).toBe("deliotx");
  });

  it("strips www", () => {
    expect(
      deriveBrandTerms({ projectName: "Default", domain: "www.example.com" }),
    ).toBe("example");
  });

  it("handles a project with no domain", () => {
    expect(deriveBrandTerms({ projectName: "Delio TX", domain: null })).toBe(
      "Delio TX",
    );
  });

  it("returns nothing to prefill when there is nothing to say", () => {
    expect(deriveBrandTerms({ projectName: "Default", domain: null })).toBe("");
  });
});

describe("applyPrefill", () => {
  const prefill = { serviceAreaKind: "local" as const, brandTerms: "Delio TX" };

  it("fills both fields on a profile nobody has saved yet", () => {
    const next = applyPrefill(EMPTY_PROFILE, prefill);
    expect(next.brandTerms).toBe("Delio TX");
    expect(next.serviceAreaKind).toBe("local");
  });

  it("never overwrites brand terms the user has curated", () => {
    const next = applyPrefill(
      { ...EMPTY_PROFILE, brandTerms: "Delio\nDelio Vending" },
      prefill,
    );
    expect(next.brandTerms).toBe("Delio\nDelio Vending");
  });

  it("leaves a CONFIRMED service area alone, even when it disagrees", () => {
    // The case this protects: a national franchise whose head office is in
    // one metro. Detection finds that metro; the user already answered
    // "Nationwide". Relabelling them local would change what every generated
    // seed keyword looks like, on the strength of a guess they overrode.
    const next = applyPrefill(
      {
        ...EMPTY_PROFILE,
        serviceAreaKind: "national",
        confirmedAt: "2026-08-01T00:00:00.000Z",
      },
      prefill,
    );
    expect(next.serviceAreaKind).toBe("national");
  });

  it("does still fill an unconfirmed AI draft's service area", () => {
    const next = applyPrefill(
      { ...EMPTY_PROFILE, source: "ai", confirmedAt: null },
      prefill,
    );
    expect(next.serviceAreaKind).toBe("local");
  });

  it("changes nothing when there is no signal to apply", () => {
    const next = applyPrefill(EMPTY_PROFILE, {
      serviceAreaKind: null,
      brandTerms: "",
    });
    expect(next).toEqual(EMPTY_PROFILE);
  });
});
