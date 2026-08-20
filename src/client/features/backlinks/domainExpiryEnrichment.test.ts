import { describe, expect, it } from "vitest";
import {
  countBillableDomains,
  selectUnresolvedDomains,
} from "@/client/features/backlinks/domainExpiryEnrichment";

describe("selectUnresolvedDomains", () => {
  it("returns the page's domains when nothing is known yet", () => {
    expect(
      selectUnresolvedDomains(["a.com", "b.com"], null, new Set()),
    ).toEqual(["a.com", "b.com"]);
  });

  it("skips domains already resolved, including ones resolved to null", () => {
    // `null` means the lookup ran and did not answer. Re-requesting it would
    // bill again for the same non-answer, so a resolved-null counts as known.
    const known = { "a.com": null, "b.com": null };
    expect(
      selectUnresolvedDomains(["a.com", "b.com", "c.com"], known, new Set()),
    ).toEqual(["c.com"]);
  });

  it("skips domains already in flight", () => {
    expect(
      selectUnresolvedDomains(["a.com", "b.com"], null, new Set(["a.com"])),
    ).toEqual(["b.com"]);
  });

  it("dedupes and drops blanks so one domain is never billed twice", () => {
    expect(
      selectUnresolvedDomains(["a.com", "a.com", "", "  "], null, new Set()),
    ).toEqual(["a.com"]);
  });

  it("collapses subdomains and www to the registrable domain", () => {
    // The server normalizes to eTLD+1 anyway; doing it here too means the
    // client asks for one domain instead of three and the row lookup still hits.
    expect(
      selectUnresolvedDomains(
        ["blog.a.com", "www.a.com", "a.com"],
        null,
        new Set(),
      ),
    ).toEqual(["a.com"]);
  });
});

describe("countBillableDomains", () => {
  it("counts only what would actually be requested", () => {
    expect(
      countBillableDomains(["a.com", "b.com"], { "a.com": null }, new Set()),
    ).toBe(1);
  });

  it("is zero once the whole page is resolved, so the button can disable", () => {
    expect(countBillableDomains(["a.com"], { "a.com": null }, new Set())).toBe(
      0,
    );
  });
});
