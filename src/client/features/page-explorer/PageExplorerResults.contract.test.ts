import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { PageExplorerResults } from "./PageExplorerResults";
import { pageExplorerSchema } from "@/types/schemas/page-explorer";
function render() {
  const result = pageExplorerSchema.parse({
    url: "https://example.com/guide?edition=one",
    domain: "example.com",
    path: "/guide",
    locationCode: 2840,
    languageCode: "en",
    keywords: [
      {
        keyword: "coffee",
        position: null,
        searchVolume: null,
        traffic: null,
        cpc: 0.25,
        url: null,
        relativeUrl: null,
        keywordDifficulty: null,
      },
    ],
    totalKeywords: null,
    estimatedTraffic: 0,
    backlinks: null,
    fetchedAt: "2026-09-01T00:00:00.000Z",
  });
  return load(
    renderToStaticMarkup(
      createElement(PageExplorerResults, { result, snapshot: null }),
    ),
  );
}
describe("Page Explorer partial captured sample", () => {
  it("never labels the displayed sample as an unknown provider total or complete traffic", () => {
    const $ = render();
    const tileValue = (label: string) =>
      $("span")
        .filter((_, el) => $(el).text() === label)
        .parent()
        .next("div")
        .text();
    expect(tileValue("Ranking keywords")).toContain("Unknown");
    expect(tileValue("Est. sample traffic")).toContain("Unknown");
    expect($.text()).not.toContain("100% of the page");
    expect($.text()).toContain("1 shown");
  });
});
