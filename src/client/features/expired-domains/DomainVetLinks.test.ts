import { describe, expect, it } from "vitest";
import {
  googleSiteSearchUrl,
  waybackHistoryUrl,
} from "@/client/features/expired-domains/DomainVetLinks";

describe("domain vetting links", () => {
  it("opens the Wayback Machine's capture calendar for the domain", () => {
    expect(waybackHistoryUrl("parcfermecoffee.com")).toBe(
      "https://web.archive.org/web/*/parcfermecoffee.com",
    );
  });

  it("searches Google with the site: operator, encoded as a query value", () => {
    expect(googleSiteSearchUrl("hunavending.com")).toBe(
      "https://www.google.com/search?q=site%3Ahunavending.com",
    );
  });
});
