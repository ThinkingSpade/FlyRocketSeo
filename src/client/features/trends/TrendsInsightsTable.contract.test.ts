import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TrendsInsightsTable } from "./TrendsInsightsTable";
it("renders an unavailable latest bucket as unknown without promoting an older value or YoY", () => {
  const html = renderToStaticMarkup(
    createElement(TrendsInsightsTable, {
      keywords: ["seo tools"],
      points: [
        { timestamp: Date.UTC(2025, 0, 5), values: [79] },
        { timestamp: Date.UTC(2026, 0, 4), values: [null] },
      ],
    }),
  );
  expect(html).not.toContain(">79</td>");
  expect(html).not.toContain("0%");
});
