import { describe, expect, it } from "vitest";
import {
  detectUrlTemplate,
  getOrigin,
  isSameOrigin,
  normalizeUrl,
} from "@/server/lib/audit/url-utils";

describe("normalizeUrl", () => {
  it("normalizes host/query/hash/trailing slash", () => {
    const value = normalizeUrl(
      "https://Example.COM/path/?b=2&a=1#section",
      "https://fallback.com",
    );

    expect(value).toBe("https://example.com/path/?a=1&b=2");
  });

  it("returns null for unsupported protocol", () => {
    expect(normalizeUrl("mailto:test@example.com")).toBeNull();
  });
});

describe("isSameOrigin", () => {
  it("accepts www host equivalence", () => {
    expect(
      isSameOrigin("https://www.example.com/products", "https://example.com"),
    ).toBe(true);
  });

  it("allows http to https upgrade on default ports", () => {
    expect(isSameOrigin("https://example.com/page", "http://example.com")).toBe(
      true,
    );
  });

  it("rejects mismatched hosts", () => {
    expect(isSameOrigin("https://example.org", "https://example.com")).toBe(
      false,
    );
  });

  /**
   * A crawl boundary stops at the exact host, so a site that publishes a
   * subdomain per city (austin.example.com, dallas.example.com, ...) is NOT
   * covered by auditing the apex — each subdomain is its own audit target.
   *
   * Pinned in both directions because the rule is enforced by
   * `withoutWwwPrefix`/`areEquivalentHostnames`, which already had to be
   * rewritten once after a pair of prefix tests accidentally widened the
   * boundary. A change there that started accepting subdomains would silently
   * turn one project's audit into a crawl of thousands of hosts, and a change
   * that stopped accepting `www` would silently halve an ordinary one.
   */
  it("does not follow the apex into a subdomain", () => {
    expect(
      isSameOrigin("https://austin.example.com/", "https://example.com"),
    ).toBe(false);
    expect(
      isSameOrigin("https://blog.example.com/post", "https://www.example.com"),
    ).toBe(false);
  });

  it("does not follow a subdomain back out to the apex or a sibling", () => {
    expect(
      isSameOrigin("https://example.com/", "https://austin.example.com"),
    ).toBe(false);
    expect(
      isSameOrigin("https://dallas.example.com/", "https://austin.example.com"),
    ).toBe(false);
  });

  it("still treats a subdomain's own www form as the same site", () => {
    // The one equivalence that survives: austin.example.com is reachable as
    // www.austin.example.com, and auditing one must cover the other.
    expect(
      isSameOrigin(
        "https://www.austin.example.com/",
        "https://austin.example.com",
      ),
    ).toBe(true);
  });
});

describe("detectUrlTemplate", () => {
  it("maps dynamic path segments", () => {
    expect(detectUrlTemplate("/blog/2026-03-01/my-great-post")).toBe(
      "/blog/:date/:slug",
    );
  });

  it("maps numeric id segments", () => {
    expect(detectUrlTemplate("/products/12345")).toBe("/products/:id");
  });
});

describe("getOrigin", () => {
  it("returns URL origin", () => {
    expect(getOrigin("https://example.com:8080/path?q=1")).toBe(
      "https://example.com:8080",
    );
  });
});
