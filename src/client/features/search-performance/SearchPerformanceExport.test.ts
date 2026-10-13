import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Papa from "papaparse";
import { exportDimensionRows, exportStriking } from "./export";
import type { Report } from "./SearchPerformanceColumns";

vi.mock("@/client/lib/posthog", () => ({ captureClientEvent: vi.fn() }));
vi.mock("@/client/lib/exportToSheets", () => ({
  exportTableToSheets: vi.fn(),
}));

let downloaded: Blob;
beforeEach(() => {
  vi.stubGlobal("document", {
    createElement: () => ({ click() {}, href: "", download: "" }),
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw new Error("Expected CSV Blob");
    downloaded = blob;
    return "blob:isolated-export";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const provenance = {
  source: "Google Search Console" as const,
  property: "sc-domain:example.com",
  country: "usa",
  device: "MOBILE",
  startDate: "2026-09-01",
  endDate: "2026-09-28",
  searchType: "web",
  dataState: "all",
  capturedAt: "2026-09-30T03:04:05Z",
};

it.each(["query", "page"] as const)(
  "downloads %s CSV with its own immutable pull, scope and coverage",
  async (dimension) => {
    exportDimensionRows(
      dimension,
      [
        {
          key: "=risky",
          clicks: 1,
          impressions: 83,
          ctr: 0.012048192771,
          position: 6.123456789,
        },
      ],
      {
        startDate: "2026-08-01",
        endDate: "2026-08-28",
        prevStartDate: "2026-07-04",
        prevEndDate: "2026-07-31",
      },
      "csv",
      { provenance, rowsExamined: 5000, truncated: true },
    );
    const parsed = Papa.parse<Record<string, string>>(await downloaded.text(), {
      header: true,
    });
    expect(parsed.data[0]).toMatchObject({
      [dimension === "query" ? "Query" : "Page"]: "'=risky",
      CTR: "0.012048192771",
      Position: "6.123456789",
      Source: "Google Search Console",
      Property: "sc-domain:example.com",
      Country: "usa",
      Device: "MOBILE",
      "Start Date": "2026-09-01",
      "End Date": "2026-09-28",
      "Search Type": "web",
      "Data State": "all",
      "Captured At": "2026-09-30T03:04:05Z",
      "Rows Examined": "5000",
      Truncated: "true",
    });
  },
);

it("keeps the striking-distance pull's coverage and stored capture in its downloaded file", async () => {
  const report: Report = {
    connected: true,
    range: {
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      prevStartDate: "2026-08-04",
      prevEndDate: "2026-08-31",
    },
    totals: { clicks: 1, impressions: 83, ctr: 1 / 83, position: 6 },
    prevTotals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    strikingDistance: [
      {
        query: "rocket",
        page: "https://example.com/",
        clicks: 1,
        impressions: 83,
        position: 6.123456789,
      },
    ],
    ctrOpportunities: [],
    queryTotals: [],
    queryPages: [],
    countries: [],
    provenance,
    sampling: {
      queryPages: { rowsExamined: 1000, truncated: true },
      queryTotals: { rowsExamined: 12, truncated: false },
    },
  };
  exportStriking(report, "csv");
  const parsed = Papa.parse<Record<string, string>>(await downloaded.text(), {
    header: true,
  });
  expect(parsed.data[0]).toMatchObject({
    Position: "6.123456789",
    "Rows Examined": "1000",
    Truncated: "true",
    "Captured At": "2026-09-30T03:04:05Z",
  });
});

it("retains pull scope and zero coverage in an empty downloaded CSV", async () => {
  exportDimensionRows(
    "query",
    [],
    {
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      prevStartDate: "2026-08-04",
      prevEndDate: "2026-08-31",
    },
    "csv",
    { provenance, rowsExamined: 0, truncated: false },
  );
  const parsed = Papa.parse<Record<string, string>>(await downloaded.text(), {
    header: true,
  });
  expect(parsed.data[0]).toMatchObject({
    Query: "",
    Property: "sc-domain:example.com",
    "Rows Examined": "0",
    "Rows Exported": "0",
    Truncated: "false",
  });
});
