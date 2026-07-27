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

  it("does not append a trailing slash to a path", () => {
    // Deliberate: a bare host normalizes to the site root ("/"), but a
    // stored path segment like "/blog" is a real resource path, not a
    // directory -- appending "/" to it can 404 on servers that don't
    // redirect a directory-less path to its slash form. So this stays
    // "/blog", not "/blog/".
    expect(buildProjectStartUrl("deliotx.com/blog")).toBe(
      "https://deliotx.com/blog",
    );
  });

  it("returns null for a null domain", () => {
    expect(buildProjectStartUrl(null)).toBeNull();
  });

  it("returns null for a whitespace-only domain", () => {
    expect(buildProjectStartUrl("   ")).toBeNull();
  });
});
