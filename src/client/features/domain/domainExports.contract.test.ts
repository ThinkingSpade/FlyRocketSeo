import { describe, expect, it } from "vitest";
import { keywordsToTable, pagesToTable, formatRounded } from "./utils";
describe("Domain research CSV evidence", () => {
  it("does not show a positive sub-unit provider estimate as observed zero", () => {
    expect(formatRounded(0.1234)).toBe("<1");
    expect(formatRounded(0)).toBe("0");
    expect(formatRounded(null)).toBe("-");
  });
  const capture = {
    source: "DataForSEO Labs" as const,
    domain: "blog.example.com",
    fetchedAt: "2026-10-01T00:00:00.000Z",
    scope: {
      locationCode: 2840,
      languageCode: "en",
      includeSubdomains: false,
      providerScope: "target" as const,
    },
  };
  it("carries provider scope and original date for keyword and page exports", () => {
    const kw = Reflect.apply(keywordsToTable, null, [
      [
        {
          keyword: "seo",
          position: null,
          searchVolume: 0,
          traffic: 0.1234,
          cpc: null,
          url: null,
          relativeUrl: null,
          keywordDifficulty: null,
        },
      ],
      capture,
    ]);
    expect(kw.rows[0]).toEqual([
      "seo",
      null,
      0,
      0.1234,
      null,
      null,
      null,
      "DataForSEO Labs",
      "blog.example.com",
      2840,
      "en",
      "target",
      false,
      "2026-10-01T00:00:00.000Z",
    ]);
    const pages = Reflect.apply(pagesToTable, null, [
      [
        {
          page: "https://blog.example.com/page",
          relativePath: "/page",
          organicTraffic: null,
          keywords: 0,
        },
      ],
      capture,
    ]);
    expect(pages.rows[0]).toContain("2026-10-01T00:00:00.000Z");
    expect(pages.headers).toContain("Provider Scope");
  });
});
