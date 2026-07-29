import { describe, expect, it } from "vitest";
import {
  classifySerpPage,
  serpPageTypeLabel,
  summarizeSerpShape,
} from "./serpShape";

describe("classifySerpPage", () => {
  it("treats a bare origin as a home page", () => {
    expect(classifySerpPage("https://deliotx.com")).toBe("homepage");
    expect(classifySerpPage("https://deliotx.com/")).toBe("homepage");
  });

  it("recognises a service page", () => {
    expect(classifySerpPage("https://deliotx.com/services/vending")).toBe(
      "service",
    );
  });

  it("recognises an article", () => {
    expect(classifySerpPage("https://example.com/blog/office-coffee")).toBe(
      "article",
    );
  });

  it("prefers article over service when a post is ABOUT services", () => {
    // "/blog/best-vending-services" is a post, not a service page. The
    // leading segment is what says so.
    expect(
      classifySerpPage("https://example.com/blog/best-vending-services"),
    ).toBe("article");
  });

  it("recognises a roundup", () => {
    expect(
      classifySerpPage("https://example.com/best-vending-companies-dallas"),
    ).toBe("listing");
  });

  it("falls back to other for an unrecognisable path", () => {
    expect(classifySerpPage("https://example.com/x7f2")).toBe("other");
  });

  it("treats an unparseable URL as having no path", () => {
    expect(classifySerpPage("not a url")).toBe("homepage");
  });
});

describe("summarizeSerpShape", () => {
  it("returns null for an empty SERP rather than inventing a shape", () => {
    expect(summarizeSerpShape([])).toBeNull();
  });

  it("reports the most common page type with its count", () => {
    expect(
      summarizeSerpShape([
        "https://a.com/services/vending",
        "https://b.com/services/coffee",
        "https://c.com/blog/post",
        "https://d.com/",
      ]),
    ).toEqual({ dominant: "service", count: 2, total: 4 });
  });

  it("breaks a tie toward the type that ranks higher", () => {
    // Position one describes the intent better than position four does.
    expect(
      summarizeSerpShape([
        "https://a.com/blog/post",
        "https://b.com/blog/another",
        "https://c.com/services/x",
        "https://d.com/services/y",
      ])?.dominant,
    ).toBe("article");
  });
});

describe("serpPageTypeLabel", () => {
  it("reads as a plain noun phrase", () => {
    expect(serpPageTypeLabel("service")).toBe("service or product pages");
    expect(serpPageTypeLabel("listing")).toBe("roundups and “best of” lists");
  });
});
