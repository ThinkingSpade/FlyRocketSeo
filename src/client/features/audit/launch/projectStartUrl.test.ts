import { describe, expect, it } from "vitest";
import { buildProjectStartUrl } from "./projectStartUrl";

describe("buildProjectStartUrl", () => {
  it("turns a bare host into a normalized https URL", () => {
    expect(buildProjectStartUrl("deliotx.com")).toBe("https://deliotx.com/");
  });

  it("leaves an already-https host alone, adding the trailing slash", () => {
    expect(buildProjectStartUrl("https://deliotx.com")).toBe(
      "https://deliotx.com/",
    );
  });

  it("is a no-op on a value that is already fully normalized", () => {
    expect(buildProjectStartUrl("https://deliotx.com/")).toBe(
      "https://deliotx.com/",
    );
  });

  it("upgrades a stored http scheme to https", () => {
    // Deliberate: rows written before the bare-host convention may still
    // carry `http://`, and this matches `AnalyzeProjectCard`'s existing
    // one-click flow, which also assumes/forces https. A future reader
    // should not "fix" this into preserving the original scheme.
    expect(buildProjectStartUrl("http://deliotx.com")).toBe(
      "https://deliotx.com/",
    );
  });

  it("preserves a www subdomain", () => {
    expect(buildProjectStartUrl("www.deliotx.com")).toBe(
      "https://www.deliotx.com/",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(buildProjectStartUrl("  deliotx.com  ")).toBe(
      "https://deliotx.com/",
    );
  });

  it("only strips a trailing slash, not a trailing path segment", () => {
    // Surprising but current: the trailing-slash strip only ever matches
    // slashes at the very end of the string, so a stored path segment like
    // "/blog" survives and gets its own trailing slash appended, rather than
    // being dropped down to the bare host.
    expect(buildProjectStartUrl("deliotx.com/blog")).toBe(
      "https://deliotx.com/blog/",
    );
  });

  it("returns null for a null domain", () => {
    expect(buildProjectStartUrl(null)).toBeNull();
  });

  it("returns null for a whitespace-only domain", () => {
    expect(buildProjectStartUrl("   ")).toBeNull();
  });
});
