import { describe, expect, it } from "vitest";
import { buildProjectHostOptions } from "./projectHostOptions";

const subdomain = (host: string, isActive: boolean) => ({ host, isActive });

describe("buildProjectHostOptions", () => {
  it("puts the apex first, then included subdomains in server order", () => {
    expect(
      buildProjectHostOptions("example.com", [
        subdomain("shop.example.com", true),
        subdomain("blog.example.com", true),
      ]),
    ).toEqual(["example.com", "shop.example.com", "blog.example.com"]);
  });

  it("drops excluded subdomains", () => {
    // The include toggle in settings is the only thing that makes a picker
    // usable on an estate of hundreds, so an excluded host must not be offered.
    expect(
      buildProjectHostOptions("example.com", [
        subdomain("shop.example.com", true),
        subdomain("staging.example.com", false),
      ]),
    ).toEqual(["example.com", "shop.example.com"]);
  });

  it("offers nothing at all when the project has no domain set", () => {
    // Without an apex there is no project site to suggest, and the stored rows
    // cannot be trusted to belong to it either.
    expect(
      buildProjectHostOptions(null, [subdomain("shop.example.com", true)]),
    ).toEqual([]);
  });

  it("offers the apex alone before any subdomain exists", () => {
    expect(buildProjectHostOptions("example.com", [])).toEqual(["example.com"]);
  });
});
