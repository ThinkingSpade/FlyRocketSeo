import { describe, expect, it } from "vitest";
import { buildCitationSearchQuery } from "./citationQuery";

describe("buildCitationSearchQuery", () => {
  it("anchors the query to the city when one is known", () => {
    expect(
      buildCitationSearchQuery({
        businessName: "Joe's Pizza",
        city: "Brooklyn, NY",
        phone: "+1 718-555-0100",
      }),
    ).toBe("Joe's Pizza Brooklyn, NY");
  });

  it("falls back to the phone number when no city is known", () => {
    expect(
      buildCitationSearchQuery({
        businessName: "Joe's Pizza",
        city: null,
        phone: "+1 718-555-0100",
      }),
    ).toBe("Joe's Pizza +1 718-555-0100");
  });

  it("falls back to the bare business name when neither is known", () => {
    expect(
      buildCitationSearchQuery({
        businessName: "Joe's Pizza",
        city: null,
        phone: null,
      }),
    ).toBe("Joe's Pizza");
  });

  it("trims whitespace-only city/phone as though absent", () => {
    expect(
      buildCitationSearchQuery({
        businessName: "Joe's Pizza",
        city: "   ",
        phone: "  ",
      }),
    ).toBe("Joe's Pizza");
  });
});
