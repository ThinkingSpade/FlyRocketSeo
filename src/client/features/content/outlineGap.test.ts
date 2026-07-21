import { describe, expect, it } from "vitest";
import { computeOutlineThemes, isThemeCovered } from "./outlineGap";

describe("computeOutlineThemes", () => {
  it("clusters similar headings across competitors and drops one-offs", () => {
    const themes = computeOutlineThemes([
      ["Vending machine costs", "Types of vending machines", "Our story"],
      ["Pricing and costs of vending machines", "Machine types explained"],
      ["Vending costs", "FAQ"],
    ]);

    const labels = themes.map((theme) => theme.label);
    // Cost theme appears in all three; the shortest heading represents it.
    expect(themes[0].label).toBe("Vending costs");
    expect(themes[0].competitorCount).toBe(3);
    // Types theme appears in two.
    expect(labels).toContain("Machine types explained");
    // "Our story" and "FAQ" are single-competitor noise.
    expect(labels).not.toContain("Our story");
    expect(labels).not.toContain("FAQ");
  });

  it("counts a competitor once per theme even with duplicate headings", () => {
    const themes = computeOutlineThemes([
      ["Delivery areas", "Delivery areas we serve"],
      ["Delivery areas"],
    ]);
    expect(themes).toHaveLength(1);
    expect(themes[0].competitorCount).toBe(2);
  });

  it("returns empty for empty or stopword-only outlines", () => {
    expect(computeOutlineThemes([])).toEqual([]);
    expect(computeOutlineThemes([["The How"], ["What When"]])).toEqual([]);
  });
});

describe("isThemeCovered", () => {
  const theme = {
    label: "Vending costs",
    competitorCount: 2,
    words: ["vending", "costs", "pricing"],
  };

  it("covers when most defining words appear in the draft", () => {
    expect(isThemeCovered("our vending pricing beats everyone", theme)).toBe(
      true,
    );
    expect(isThemeCovered("we sell snacks", theme)).toBe(false);
    expect(isThemeCovered("", theme)).toBe(false);
  });
});
