import { describe, expect, it } from "vitest";
import {
  describeGeoRunError,
  describeGeoUnavailable,
} from "./geoUnavailableMessage";

describe("describeGeoUnavailable (resolveGeo already returned provider: none)", () => {
  it("names the actual country that lacks coverage, and says nothing was guessed", () => {
    const message = describeGeoUnavailable("Keyword difficulty", {
      provider: "none",
      label: "Iceland",
    });
    expect(message).not.toBeNull();
    expect(message).toContain("Iceland");
    expect(message?.toLowerCase()).toContain(
      "keyword difficulty".toLowerCase(),
    );
    // Must not claim a number is showing when none exists.
    expect(message).not.toMatch(/showing the national figure/i);
  });

  it("returns null when a provider actually exists -- nothing to say", () => {
    expect(
      describeGeoUnavailable("Keyword difficulty", {
        provider: "labs",
        label: "United States",
      }),
    ).toBeNull();
  });
});

describe("describeGeoRunError (a metered call failed while an area was active)", () => {
  it("names the local area and does not silently claim a fallback occurred", () => {
    const message = describeGeoRunError(
      "keyword data",
      { scope: "local", label: "Dallas-Ft. Worth, TX" },
      "Something went wrong.",
    );
    expect(message).toContain("Dallas-Ft. Worth, TX");
    expect(message).toContain("Something went wrong.");
    // Honesty requirement: never assert a fallback number is now showing.
    expect(message).not.toMatch(/showing the national figure/i);
  });

  it("falls back to the plain message untouched for a national-scope failure", () => {
    const message = describeGeoRunError(
      "keyword data",
      { scope: "national", label: "United States" },
      "Something went wrong.",
    );
    expect(message).toBe("Something went wrong.");
  });
});
