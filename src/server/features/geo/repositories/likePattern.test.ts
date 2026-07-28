import { describe, expect, it } from "vitest";
import { buildNamePrefixPattern } from "./likePattern";

describe("buildNamePrefixPattern", () => {
  it("appends a trailing wildcard for a plain query", () => {
    expect(buildNamePrefixPattern("dal")).toBe("dal%");
  });

  it("escapes a literal percent sign so it matches literally, not as a wildcard", () => {
    expect(buildNamePrefixPattern("50%")).toBe("50\\%%");
  });

  it("escapes a literal underscore so it matches literally, not as a single-char wildcard", () => {
    expect(buildNamePrefixPattern("fort_worth")).toBe("fort\\_worth%");
  });

  it("escapes a literal backslash so it doesn't swallow the next character", () => {
    expect(buildNamePrefixPattern("a\\b")).toBe("a\\\\b%");
  });

  it("leaves ordinary punctuation and spacing untouched", () => {
    expect(buildNamePrefixPattern("st. louis")).toBe("st. louis%");
  });
});
