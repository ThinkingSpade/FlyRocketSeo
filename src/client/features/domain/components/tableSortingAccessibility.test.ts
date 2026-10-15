import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainKeywordsTable } from "./DomainKeywordsTable";
import { DomainPagesTable } from "./DomainPagesTable";

const keyword = {
  keyword: "office coffee",
  position: 8,
  searchVolume: 300,
  traffic: 12,
  cpc: 2,
  url: null,
  relativeUrl: null,
  keywordDifficulty: 20,
};

describe("provider-sorted table headings", () => {
  it("announces the provider's volume sort without reordering the current page", () => {
    const html = renderToStaticMarkup(
      createElement(DomainKeywordsTable, {
        domain: "example.com",
        rows: [keyword],
        selectedKeywords: new Set<string>(),
        visibleKeywords: [keyword.keyword],
        sortMode: "volume",
        currentSortOrder: "desc",
        onSortClick: () => undefined,
        onToggleKeyword: () => undefined,
      }),
    );
    expect(html).toMatch(
      /<th[^>]*aria-sort="descending"[^>]*><button[^>]*aria-label="Sort by Volume"/,
    );
    expect(html).not.toMatch(/<th[^>]*aria-sort="ascending"/);
  });
  it("announces ascending page keyword totals", () => {
    const html = renderToStaticMarkup(
      createElement(DomainPagesTable, {
        domain: "example.com",
        rows: [
          {
            page: "https://example.com/coffee",
            relativePath: "/coffee",
            organicTraffic: 50,
            keywords: 12,
          },
        ],
        sortMode: "volume",
        currentSortOrder: "asc",
        onSortClick: () => undefined,
      }),
    );
    expect(html).toMatch(
      /<th[^>]*aria-sort="ascending"[^>]*><button[^>]*aria-label="Sort by Keywords"/,
    );
  });
});
