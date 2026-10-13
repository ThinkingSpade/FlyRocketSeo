import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/client/lib/posthog", () => ({ captureClientEvent: vi.fn() }));
vi.mock("@/client/lib/exportToSheets", () => ({
  exportTableToSheets: vi.fn(),
}));
import {
  buildRankTrackingExport,
  DeviceRankCell,
} from "./RankTrackingTableParts";
import type {
  RankTrackingDeviceResult,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";
const missing: RankTrackingDeviceResult = {
  position: null,
  previousPosition: 8,
  rankingUrl: null,
  serpFeatures: [],
  availability: "unavailable",
  comparisonAvailability: "observed",
  checkedAt: null,
};
describe("rank table and export evidence", () => {
  it("shows unknown when no successful check exists instead of a lost ranking", () => {
    expect(
      renderToStaticMarkup(createElement(DeviceRankCell, { result: missing })),
    ).toContain("Unknown");
  });
  it("labels an observed empty result as not found, including the checked depth", () => {
    expect(
      renderToStaticMarkup(
        createElement(DeviceRankCell, {
          result: {
            ...missing,
            availability: "observed",
            previousPosition: null,
            scope: {
              projectId: "p",
              configId: "c",
              domain: "example.com",
              locationCode: 2840,
              languageCode: "en",
              serpDepth: 40,
            },
          },
        }),
      ),
    ).toContain("Not found");
  });
  it("exports missing checks without fake lost changes and includes original capture/source/scope", () => {
    const row: RankTrackingRow = {
      trackingKeywordId: "kw",
      keyword: "alpha",
      searchVolume: 0,
      keywordDifficulty: null,
      cpc: 0,
      desktop: missing,
      mobile: {
        ...missing,
        availability: "observed",
        comparisonAvailability: "unavailable",
        position: 3,
        previousPosition: null,
        checkedAt: "2026-10-01T00:00:00Z",
        source: "DataForSEO Google Organic SERP",
      },
    };
    const result = buildRankTrackingExport([row], true, true);
    expect(result.rows[0]?.[result.headers.indexOf("Desktop Change")]).toBe("");
    expect(result.rows[0]?.[result.headers.indexOf("Desktop Status")]).toBe(
      "Unknown",
    );
    expect(result.rows[0]?.[result.headers.indexOf("Mobile Captured At")]).toBe(
      "2026-10-01T00:00:00Z",
    );
    expect(result.rows[0]?.[result.headers.indexOf("Mobile Source")]).toBe(
      "DataForSEO Google Organic SERP",
    );
    expect(result.rows[0]?.[result.headers.indexOf("Mobile Change")]).toBe("");
  });
});
