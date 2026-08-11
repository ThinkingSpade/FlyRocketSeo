import { describe, expect, it } from "vitest";
import {
  classifyAnchor,
  computeAnchorHealth,
  extractBrandTokens,
  type AnchorHealthRow,
} from "./anchorHealth";

const brand = extractBrandTokens("deliotx.com");

function row(
  anchor: string | null,
  referringDomains: number | null,
  backlinks: number | null = null,
): AnchorHealthRow {
  return { anchor, referringDomains, backlinks };
}

describe("extractBrandTokens", () => {
  it("takes the domain label", () => {
    expect(extractBrandTokens("deliotx.com")).toEqual(["deliotx"]);
  });

  it("strips scheme, www and path", () => {
    expect(extractBrandTokens("https://www.deliotx.com/coffee")).toEqual([
      "deliotx",
    ]);
  });

  it("offers spaced and joined forms for hyphenated brands", () => {
    expect(extractBrandTokens("fly-rocket-seo.co.uk")).toEqual([
      "fly-rocket-seo",
      "fly rocket seo",
      "flyrocketseo",
    ]);
  });

  it("ignores labels too short to be a brand", () => {
    expect(extractBrandTokens("ab.com")).toEqual([]);
  });
});

describe("classifyAnchor", () => {
  it("treats blank and whitespace anchors as empty", () => {
    expect(classifyAnchor("", brand)).toBe("empty");
    expect(classifyAnchor("   ", brand)).toBe("empty");
    expect(classifyAnchor(null, brand)).toBe("empty");
  });

  it("recognises bare URLs in several forms", () => {
    expect(classifyAnchor("https://deliotx.com", brand)).toBe("naked-url");
    expect(classifyAnchor("www.example.com", brand)).toBe("naked-url");
    expect(classifyAnchor("example.com/pricing", brand)).toBe("naked-url");
  });

  it("does not treat prose mentioning a domain as a URL anchor", () => {
    expect(classifyAnchor("we love example.com a lot", brand)).toBe(
      "descriptive",
    );
  });

  it("recognises generic filler anchors", () => {
    expect(classifyAnchor("Click here", brand)).toBe("generic");
    expect(classifyAnchor("read more", brand)).toBe("generic");
  });

  it("recognises the brand inside a longer anchor", () => {
    expect(classifyAnchor("the Deliotx team", brand)).toBe("branded");
  });

  it("falls back to descriptive for commercial phrases", () => {
    expect(classifyAnchor("best coffee machine", brand)).toBe("descriptive");
  });

  it("classifies a bare brand domain as a URL, not as branded", () => {
    // Both are true; URL form is checked first because that is how the
    // breakdown should read it.
    expect(classifyAnchor("deliotx.com", brand)).toBe("naked-url");
  });
});

describe("computeAnchorHealth", () => {
  it("returns null when no row carries a usable count", () => {
    expect(computeAnchorHealth([], "deliotx.com")).toBeNull();
    expect(computeAnchorHealth([row("x", 0, 0)], "deliotx.com")).toBeNull();
  });

  it("counts by referring domains, not backlinks", () => {
    const health = computeAnchorHealth(
      [row("deliotx", 10, 5000), row("coffee machines", 10, 1)],
      "deliotx.com",
    );
    expect(health?.totalMentions).toBe(20);
    expect(
      health?.categories.find((c) => c.category === "branded")?.mentions,
    ).toBe(10);
  });

  it("falls back to backlinks when referring domains is missing", () => {
    const health = computeAnchorHealth(
      [row("deliotx", null, 7)],
      "deliotx.com",
    );
    expect(health?.totalMentions).toBe(7);
  });

  it("orders the breakdown consistently rather than by volume", () => {
    const health = computeAnchorHealth(
      [row("coffee machines", 50), row("deliotx", 1), row("", 5)],
      "deliotx.com",
    );
    expect(health?.categories.map((c) => c.category)).toEqual([
      "branded",
      "descriptive",
      "empty",
    ]);
  });

  it("flags a dominant commercial anchor as over-optimized", () => {
    const health = computeAnchorHealth(
      [row("best coffee machine", 40), row("deliotx", 60)],
      "deliotx.com",
    );
    expect(health?.verdict).toBe("over-optimized");
    expect(health?.topCommercial?.anchor).toBe("best coffee machine");
    expect(health?.topCommercial?.share).toBeCloseTo(0.4, 5);
    expect(health?.note).toContain("40%");
  });

  it("warns before the over-optimized threshold", () => {
    const health = computeAnchorHealth(
      [row("best coffee machine", 20), row("deliotx", 80)],
      "deliotx.com",
    );
    expect(health?.verdict).toBe("watch");
  });

  it("treats a well-spread profile as healthy", () => {
    const health = computeAnchorHealth(
      [row("best coffee machine", 5), row("deliotx", 95)],
      "deliotx.com",
    );
    expect(health?.verdict).toBe("healthy");
  });

  it("does not judge a profile too small to read", () => {
    const health = computeAnchorHealth(
      [row("best coffee machine", 3), row("deliotx", 1)],
      "deliotx.com",
    );
    expect(health?.verdict).toBe("insufficient");
  });

  it("starts evaluating the profile at exactly ten mentions", () => {
    const health = computeAnchorHealth(
      [row("best coffee machine", 3), row("deliotx", 7)],
      "deliotx.com",
    );
    expect(health?.totalMentions).toBe(10);
    expect(health?.verdict).toBe("over-optimized");
  });

  it("never treats brand or URL anchors as the commercial concentration", () => {
    const health = computeAnchorHealth(
      [row("deliotx", 90), row("https://deliotx.com", 10)],
      "deliotx.com",
    );
    expect(health?.topCommercial).toBeNull();
    expect(health?.verdict).toBe("healthy");
  });
});
