import { describe, expect, it } from "vitest";
import {
  altFromSrc,
  buildPageSuggestions,
  buildSuggestions,
  countByElement,
  META_MAX,
  slugWords,
  TITLE_MAX,
  truncateWords,
  type PageInput,
} from "./suggestions";

function page(overrides: Partial<PageInput> = {}): PageInput {
  return {
    url: "https://example.com/coffee-service",
    title: "Office Coffee Service for Modern Workplaces",
    metaDescription:
      "We deliver, install and restock office coffee equipment across the metro area, so your team always has something good to drink.",
    h1Count: 1,
    images: [],
    ...overrides,
  };
}

describe("slugWords", () => {
  it("turns the last path segment into words", () => {
    expect(slugWords("https://x.com/blog/office-coffee-station")).toBe(
      "Office Coffee Station",
    );
  });

  it("drops extensions and CMS date prefixes", () => {
    expect(slugWords("https://x.com/blog/2026-05-24-smart-cooler.html")).toBe(
      "Smart Cooler",
    );
  });

  it("is empty for the homepage", () => {
    expect(slugWords("https://x.com/")).toBe("");
  });
});

describe("truncateWords", () => {
  it("leaves short strings alone", () => {
    expect(truncateWords("Short title", 60)).toBe("Short title");
  });

  it("cuts on a word boundary and strips trailing punctuation", () => {
    const result = truncateWords(
      "Office Coffee Service for Modern Workplaces and Breakrooms Everywhere",
      40,
    );
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).not.toMatch(/[\s|,-]$/);
    expect(result.split(" ").at(-1)).not.toBe("Workplac");
  });

  it("hard-cuts rather than returning almost nothing when a word is huge", () => {
    const result = truncateWords("Supercalifragilisticexpialidocious", 10);
    expect(result).toHaveLength(10);
  });
});

describe("altFromSrc", () => {
  it("derives words from a descriptive filename", () => {
    expect(altFromSrc("/img/office-coffee-station.jpg")).toBe(
      "Office Coffee Station",
    );
  });

  it("ignores query strings", () => {
    expect(altFromSrc("/img/water-cooler.png?w=800&v=2")).toBe("Water Cooler");
  });

  it("declines to guess from hashes and camera filenames", () => {
    expect(altFromSrc("/img/a3f9c2b81e4d7a60.jpg")).toBeNull();
    expect(altFromSrc("/img/IMG_20240513.jpg")).toBeNull();
    expect(altFromSrc("/img/x.png")).toBeNull();
  });
});

describe("title rules", () => {
  it("writes a title when the page has none, using the top query", () => {
    const [suggestion] = buildPageSuggestions(
      page({
        title: null,
        queries: [{ query: "office coffee service", impressions: 900 }],
      }),
      "Deliotx",
    );
    expect(suggestion.element).toBe("title");
    expect(suggestion.suggestedValue).toContain("Office Coffee Service");
    expect(suggestion.suggestedValue).toContain("Deliotx");
    expect(suggestion.currentValue).toBeNull();
  });

  it("trims a title that would be cut off in results", () => {
    const long =
      "Office Coffee Service and Water Delivery for Modern Workplaces Across the Entire Metro Area";
    const [suggestion] = buildPageSuggestions(page({ title: long }));
    expect(suggestion.element).toBe("title");
    expect(suggestion.suggestedValue.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(suggestion.reason).toContain("cut off");
  });

  it("surfaces a query the page ranks for but never names", () => {
    const [suggestion] = buildPageSuggestions(
      page({
        title: "Our Services",
        queries: [{ query: "micro market kiosk", impressions: 1200 }],
      }),
    );
    expect(suggestion.element).toBe("title");
    expect(suggestion.suggestedValue).toContain("Micro Market Kiosk");
    expect(suggestion.reason).toContain("micro market kiosk");
  });

  it("picks the highest-impression query, not the first listed", () => {
    const [suggestion] = buildPageSuggestions(
      page({
        title: "Our Services",
        queries: [
          { query: "low volume term", impressions: 10 },
          { query: "vending machines", impressions: 5000 },
        ],
      }),
    );
    expect(suggestion.suggestedValue).toContain("Vending Machines");
  });

  it("says nothing when the title already covers the query and fits", () => {
    const suggestions = buildPageSuggestions(
      page({
        queries: [{ query: "office coffee service", impressions: 900 }],
      }),
    );
    expect(suggestions.filter((s) => s.element === "title")).toEqual([]);
  });
});

describe("meta rules", () => {
  it("drafts a description when there is none", () => {
    const suggestions = buildPageSuggestions(
      page({
        metaDescription: null,
        queries: [{ query: "office coffee service", impressions: 900 }],
      }),
    );
    const meta = suggestions.find((s) => s.element === "meta");
    expect(meta?.suggestedValue.length).toBeLessThanOrEqual(META_MAX);
    expect(meta?.reason).toContain("Google writes its own snippet");
  });

  it("trims an over-long description", () => {
    const meta = buildPageSuggestions(
      page({ metaDescription: "x ".repeat(120) }),
    ).find((s) => s.element === "meta");
    expect(meta?.suggestedValue.length).toBeLessThanOrEqual(META_MAX);
  });

  it("leaves a well-sized description alone", () => {
    expect(
      buildPageSuggestions(page()).filter((s) => s.element === "meta"),
    ).toEqual([]);
  });
});

describe("h1 rules", () => {
  it("suggests an H1 when the page has none", () => {
    const h1 = buildPageSuggestions(page({ h1Count: 0 })).find(
      (s) => s.element === "h1",
    );
    expect(h1?.suggestedValue).toBe(
      "Office Coffee Service for Modern Workplaces",
    );
    expect(h1?.currentValue).toBeNull();
  });

  it("flags competing H1s and reports the count", () => {
    const h1 = buildPageSuggestions(page({ h1Count: 3 })).find(
      (s) => s.element === "h1",
    );
    expect(h1?.currentValue).toBe("3 H1 tags");
    expect(h1?.reason).toContain("3 H1 tags");
  });

  it("is silent on a well-formed page", () => {
    expect(
      buildPageSuggestions(page()).filter((s) => s.element === "h1"),
    ).toEqual([]);
  });
});

describe("alt rules", () => {
  it("suggests alt text only for images that lack it", () => {
    const suggestions = buildPageSuggestions(
      page({
        images: [
          { src: "/img/coffee-machine.jpg", alt: "" },
          { src: "/img/already-described.jpg", alt: "A described image" },
          { src: "/img/water-cooler.png", alt: null },
        ],
      }),
    ).filter((s) => s.element === "alt");

    expect(suggestions).toHaveLength(2);
    expect(suggestions.map((s) => s.target)).toEqual([
      "/img/coffee-machine.jpg",
      "/img/water-cooler.png",
    ]);
    expect(suggestions[0].suggestedValue).toBe("Coffee Machine");
  });

  it("skips images whose filename carries no meaning", () => {
    const suggestions = buildPageSuggestions(
      page({ images: [{ src: "/img/8fa93bc21e0d4f57.jpg", alt: "" }] }),
    ).filter((s) => s.element === "alt");
    expect(suggestions).toEqual([]);
  });
});

describe("buildSuggestions", () => {
  it("covers every page and counts by element", () => {
    const suggestions = buildSuggestions([
      page({ title: null, url: "https://example.com/a" }),
      page({ h1Count: 0, url: "https://example.com/b" }),
      page({
        url: "https://example.com/c",
        images: [{ src: "/img/smart-cooler.jpg", alt: "" }],
      }),
    ]);

    const counts = countByElement(suggestions);
    expect(counts.title).toBe(1);
    expect(counts.h1).toBe(1);
    expect(counts.alt).toBe(1);
  });

  it("returns nothing for a clean page", () => {
    expect(buildSuggestions([page()])).toEqual([]);
  });
});
