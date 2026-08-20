import { describe, expect, it } from "vitest";
import {
  collectDataforseoHosts,
  collectGscHosts,
  isSubdomainOfApex,
  mergeDiscoveredHosts,
  normalizeHost,
} from "./subdomainHosts";

describe("normalizeHost", () => {
  it("reduces URLs, ports, and casing to a bare host", () => {
    expect(normalizeHost("https://Blog.Example.com/posts?a=1")).toBe(
      "blog.example.com",
    );
    expect(normalizeHost("blog.example.com:8443")).toBe("blog.example.com");
    expect(normalizeHost("  shop.example.com  ")).toBe("shop.example.com");
  });

  it("strips the root-label dot so one host cannot occupy two rows", () => {
    expect(normalizeHost("blog.example.com.")).toBe("blog.example.com");
  });

  it("keeps a www prefix, leaving the apex question to isSubdomainOfApex", () => {
    expect(normalizeHost("www.example.com")).toBe("www.example.com");
  });

  it("rejects input that is not a registrable host", () => {
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost("localhost")).toBeNull();
    expect(normalizeHost("192.168.1.1")).toBeNull();
    expect(normalizeHost("blog.example.por")).toBeNull();
    expect(normalizeHost("not a domain")).toBeNull();
  });
});

describe("isSubdomainOfApex", () => {
  it("accepts hosts beneath the apex, at any depth", () => {
    expect(isSubdomainOfApex("blog.example.com", "example.com")).toBe(true);
    expect(isSubdomainOfApex("a.b.example.com", "example.com")).toBe(true);
  });

  it("rejects the apex itself and its www form", () => {
    expect(isSubdomainOfApex("example.com", "example.com")).toBe(false);
    // The audit crawler treats apex and www as one origin; listing www as a
    // subdomain would duplicate the project's own site.
    expect(isSubdomainOfApex("www.example.com", "example.com")).toBe(false);
  });

  it("does not match a host that merely ends with the apex string", () => {
    expect(isSubdomainOfApex("notexample.com", "example.com")).toBe(false);
    expect(isSubdomainOfApex("evilexample.com", "example.com")).toBe(false);
  });

  it("scopes to the apex, not the registrable domain", () => {
    // A project whose own domain is already a subdomain must not sweep in a
    // sibling it does not own.
    expect(isSubdomainOfApex("eu.shop.example.com", "shop.example.com")).toBe(
      true,
    );
    expect(isSubdomainOfApex("blog.example.com", "shop.example.com")).toBe(
      false,
    );
  });
});

describe("collectGscHosts", () => {
  it("sums clicks and impressions per subdomain host", () => {
    const hosts = collectGscHosts(
      [
        { keys: ["https://blog.example.com/a"], clicks: 5, impressions: 100 },
        { keys: ["https://blog.example.com/b"], clicks: 3, impressions: 50 },
        { keys: ["https://shop.example.com/x"], clicks: 1, impressions: 10 },
      ],
      "example.com",
    );

    expect(hosts).toEqual([
      {
        host: "blog.example.com",
        clicks: 8,
        impressions: 150,
        organicKeywords: null,
        organicTraffic: null,
      },
      {
        host: "shop.example.com",
        clicks: 1,
        impressions: 10,
        organicKeywords: null,
        organicTraffic: null,
      },
    ]);
  });

  it("drops the apex's own pages, www, and unusable rows", () => {
    const hosts = collectGscHosts(
      [
        { keys: ["https://example.com/home"], clicks: 9, impressions: 90 },
        { keys: ["https://www.example.com/home"], clicks: 9, impressions: 90 },
        { keys: ["https://other.com/x"], clicks: 9, impressions: 90 },
        { keys: [], clicks: 1, impressions: 1 },
        { clicks: 1, impressions: 1 },
      ],
      "example.com",
    );

    expect(hosts).toEqual([]);
  });
});

const rankedItem = (url: string, etv: number) => ({
  ranked_serp_element: { serp_item: { url, etv } },
});

describe("collectDataforseoHosts", () => {
  it("counts ranking keywords and sums traffic per host", () => {
    const hosts = collectDataforseoHosts(
      [
        rankedItem("https://blog.example.com/a", 10.4),
        rankedItem("https://blog.example.com/b", 5.2),
        rankedItem("https://shop.example.com/x", 2.1),
      ],
      "example.com",
    );

    expect(hosts).toEqual([
      {
        host: "blog.example.com",
        clicks: null,
        impressions: null,
        organicKeywords: 2,
        // Rounded once after summing (15.6), not per keyword — per-keyword
        // rounding would have given 15.
        organicTraffic: 16,
      },
      {
        host: "shop.example.com",
        clicks: null,
        impressions: null,
        organicKeywords: 1,
        organicTraffic: 2,
      },
    ]);
  });

  it("falls back to the element-level url and etv", () => {
    const hosts = collectDataforseoHosts(
      [
        {
          ranked_serp_element: {
            url: "https://docs.example.com/guide",
            etv: 4,
          },
        },
      ],
      "example.com",
    );

    expect(hosts).toEqual([
      {
        host: "docs.example.com",
        clicks: null,
        impressions: null,
        organicKeywords: 1,
        organicTraffic: 4,
      },
    ]);
  });

  it("skips items with no usable URL", () => {
    expect(
      collectDataforseoHosts(
        [{}, { ranked_serp_element: null }, { ranked_serp_element: {} }],
        "example.com",
      ),
    ).toEqual([]);
  });
});

describe("mergeDiscoveredHosts", () => {
  it("unions metrics from both sources for a host found by each", () => {
    const merged = mergeDiscoveredHosts([
      [
        {
          host: "blog.example.com",
          clicks: 8,
          impressions: 150,
          organicKeywords: null,
          organicTraffic: null,
        },
      ],
      [
        {
          host: "blog.example.com",
          clicks: null,
          impressions: null,
          organicKeywords: 2,
          organicTraffic: 16,
        },
        {
          host: "shop.example.com",
          clicks: null,
          impressions: null,
          organicKeywords: 1,
          organicTraffic: 2,
        },
      ],
    ]);

    expect(merged).toEqual([
      {
        host: "blog.example.com",
        clicks: 8,
        impressions: 150,
        organicKeywords: 2,
        organicTraffic: 16,
      },
      {
        host: "shop.example.com",
        clicks: null,
        impressions: null,
        organicKeywords: 1,
        organicTraffic: 2,
      },
    ]);
  });

  it("keeps the first source's value when both measured the same metric", () => {
    const merged = mergeDiscoveredHosts([
      [
        {
          host: "blog.example.com",
          clicks: 8,
          impressions: 150,
          organicKeywords: null,
          organicTraffic: null,
        },
      ],
      [
        {
          host: "blog.example.com",
          clicks: 99,
          impressions: 999,
          organicKeywords: null,
          organicTraffic: null,
        },
      ],
    ]);

    expect(merged[0]?.clicks).toBe(8);
    expect(merged[0]?.impressions).toBe(150);
  });

  it("does not mutate the caller's input rows", () => {
    const first = {
      host: "blog.example.com",
      clicks: 8,
      impressions: 150,
      organicKeywords: null,
      organicTraffic: null,
    };

    mergeDiscoveredHosts([
      [first],
      [
        {
          host: "blog.example.com",
          clicks: null,
          impressions: null,
          organicKeywords: 2,
          organicTraffic: 16,
        },
      ],
    ]);

    expect(first.organicKeywords).toBeNull();
  });
});
