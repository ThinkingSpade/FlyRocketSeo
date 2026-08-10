import { describe, expect, it } from "vitest";
import { resolveDiscoveryMode } from "./resolveDiscoveryMode";

describe("resolveDiscoveryMode", () => {
  it("uses keyword-seeded discovery when the seed is representative", () => {
    expect(resolveDiscoveryMode(40, true)).toBe("serp");
  });

  it("falls back when Search Console is not connected", () => {
    expect(resolveDiscoveryMode(0, false)).toBe("domain");
  });

  it("falls back rather than paying for an answer from a handful of queries", () => {
    expect(resolveDiscoveryMode(3, true)).toBe("domain");
  });

  it("treats exactly the minimum seed as representative", () => {
    expect(resolveDiscoveryMode(5, true)).toBe("serp");
  });
});
