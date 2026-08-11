import { describe, expect, it } from "vitest";
import {
  normalizeDiscoveredDomain,
  normalizeDomainInput,
} from "@/server/lib/domainUtils";
import { isValidDomainHost } from "@/types/schemas/domain";

describe("isValidDomainHost", () => {
  it("accepts real registrable domains", () => {
    expect(isValidDomainHost("example.com")).toBe(true);
    expect(isValidDomainHost("sub.example.co.uk")).toBe(true);
    expect(isValidDomainHost("flyrocketseo.dev")).toBe(true);
  });

  it("rejects fake TLDs, IPs, and bare hosts", () => {
    expect(isValidDomainHost("example.por")).toBe(false);
    expect(isValidDomainHost("localhost")).toBe(false);
    expect(isValidDomainHost("127.0.0.1")).toBe(false);
  });
});

describe("normalizeDomainInput", () => {
  it("normalizes a valid domain, stripping protocol/www/path", () => {
    expect(
      normalizeDomainInput("https://www.Example.com/path?q=1", false),
    ).toBe("example.com");
    expect(normalizeDomainInput("blog.example.com", true)).toBe(
      "blog.example.com",
    );
  });

  it("rejects a fake TLD before it can reach DataForSEO", () => {
    expect(() => normalizeDomainInput("victorgomez.por", false)).toThrowError(
      /valid domain/i,
    );
    // Validation must also run on the includeSubdomains=true path.
    expect(() => normalizeDomainInput("victorgomez.por", true)).toThrowError(
      /valid domain/i,
    );
  });

  it("rejects empty input", () => {
    expect(() => normalizeDomainInput("   ", false)).toThrowError(/required/i);
  });
});

describe("normalizeDiscoveredDomain", () => {
  it("lowercases and strips a leading www.", () => {
    expect(normalizeDiscoveredDomain("WWW.AVFusa.com")).toBe("avfusa.com");
  });

  it("leaves an already-clean hostname untouched", () => {
    expect(normalizeDiscoveredDomain("avfusa.com")).toBe("avfusa.com");
  });

  it("preserves non-www subdomains, matching includeSubdomains=true", () => {
    expect(normalizeDiscoveredDomain("Shop.Example.com")).toBe(
      "shop.example.com",
    );
  });

  it("does not throw on a value that would fail domain validation", () => {
    // A single malformed item in a page of discovery results must not fail
    // the whole request the way a bad user-typed domain input should.
    expect(() => normalizeDiscoveredDomain("not a domain")).not.toThrow();
    expect(() => normalizeDiscoveredDomain("")).not.toThrow();
  });

  it("agrees with normalizeDomainInput(x, true) for well-formed hosts, so a discovered row and a saved override compare equal", () => {
    const cases = ["AVFUSA.com", "www.AVFusa.com", "shop.AVFusa.com"];
    for (const value of cases) {
      expect(normalizeDiscoveredDomain(value)).toBe(
        normalizeDomainInput(value, true),
      );
    }
  });
});
