import { describe, expect, it, vi } from "vitest";
vi.mock("@/client/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  downloadCsv: vi.fn(),
}));
import {
  KEYWORD_RESEARCH_HEADERS,
  keywordResearchExportRow,
  downloadKeywordResearchCsv,
} from "./keywordControllerActions";
import { downloadCsv } from "@/client/lib/csv";
import { savedKeywordExportRow } from "@/client/features/saved-keywords/savedKeywordsUtils";
const observation = {
  source: "DataForSEO Labs" as const,
  projectId: "p1",
  locationCode: 2840,
  languageCode: "en",
  clickstream: false,
  fetchedAt: "2026-10-01T12:00:00.000Z",
};
const row = {
  keyword: "seo",
  searchVolume: 0,
  cpc: null,
  competition: null,
  keywordDifficulty: 0,
  intent: "unknown" as const,
  trend: [],
  observation,
};
describe("Keyword CSV capture contracts", () => {
  it("keeps provider estimate precision in the actual downloaded CSV", () => {
    downloadKeywordResearchCsv([["seo", 0, 0.1234, 0.001, 0, "unknown"]]);
    expect(vi.mocked(downloadCsv).mock.calls[0][1]).toContain(
      '"0.1234","0.001"',
    );
  });
  it("exports original source/date/project/market beside unknown and zero", () => {
    const cells = keywordResearchExportRow(row);
    expect(cells.slice(0, 6)).toEqual(["seo", 0, "", "", 0, "unknown"]);
    expect(KEYWORD_RESEARCH_HEADERS.slice(6)).toEqual([
      "Source",
      "Project ID",
      "Location Code",
      "Language",
      "Clickstream",
      "Fetched At",
    ]);
    expect(cells.slice(6)).toEqual([
      "DataForSEO Labs",
      "p1",
      2840,
      "en",
      false,
      "2026-10-01T12:00:00.000Z",
    ]);
  });
  it("keeps saved keywords original date and market in exported files", () => {
    const cells = savedKeywordExportRow({
      ...row,
      id: "s1",
      projectId: "p1",
      locationCode: 2352,
      languageCode: "is",
      createdAt: "2026-10-13",
      fetchedAt: "2026-01-03",
      monthlySearches: [],
      tags: [],
    });
    expect(cells).toContain(2352);
    expect(cells).toContain("is");
    expect(cells).toContain("p1");
    expect(cells).toContain("2026-01-03");
  });
});
