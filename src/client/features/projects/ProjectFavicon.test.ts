import { describe, expect, it } from "vitest";
import { faviconUrl } from "./ProjectFavicon";

describe("faviconUrl", () => {
  it("takes the bare host from a stored domain", () => {
    expect(faviconUrl("americavending.com")).toContain(
      "domain=americavending.com",
    );
  });

  it("strips a scheme and any path, which is how domains get pasted in", () => {
    expect(faviconUrl("https://deliotx.com/services/")).toContain(
      "domain=deliotx.com",
    );
  });

  it("returns null for a value that is not a host, so the caller draws its fallback", () => {
    // A project can be created before its domain is set, and the settings
    // field does not force a valid host. Rendering an <img> for these would
    // show a broken-image glyph in the switcher.
    expect(faviconUrl("")).toBeNull();
    expect(faviconUrl("   ")).toBeNull();
    expect(faviconUrl("not a domain")).toBeNull();
  });

  it("percent-encodes the host rather than interpolating it raw", () => {
    expect(faviconUrl("exa mple.com")).toContain("exa%20mple.com");
  });
});
