import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TrendsObservationDetails } from "./TrendsObservationDetails";
import { trendsResultSchema } from "@/types/schemas/trends";
const observation = {
  keywords: ["seo tools"],
  averages: [30],
  points: [
    { date: "2025-01-05", timestamp: Date.UTC(2025, 0, 5), values: [79] },
    { date: "2026-01-04", timestamp: Date.UTC(2026, 0, 4), values: [null] },
  ],
  fetchedAt: "2026-01-05T12:00:00Z",
};
it("renders the stored original source/window/capture and relative-interest meaning", () => {
  const result = trendsResultSchema.parse({
    ...observation,
    contractVersion: 2,
    dataSource: "DataForSEO Google Trends",
    scope: {
      projectId: "p1",
      locationCode: null,
      languageCode: "en",
      dateFrom: "2025-01-01",
      dateTo: "2026-01-04",
    },
  });
  const html = renderToStaticMarkup(
    createElement(TrendsObservationDetails, {
      result,
      regionLabel: "United States",
    }),
  );
  expect(html).toContain("DataForSEO Google Trends");
  expect(html).toContain("Worldwide");
  expect(html).not.toContain("United States");
  expect(html).toContain("2025-01-01");
  expect(html).toContain("2026-01-04");
  expect(html).toContain("2026-01-05");
  expect(html).toContain("insufficient data");
});
it("does not assign the current market or source to legacy stored curves", () => {
  const html = renderToStaticMarkup(
    createElement(TrendsObservationDetails, {
      result: trendsResultSchema.parse(observation),
      regionLabel: "United States",
    }),
  );
  expect(html).toContain("Source and market unverified");
  expect(html).not.toContain("United States");
  expect(html).not.toContain("Worldwide");
});
