import { describe, expect, it } from "vitest";
import {
  buildCompetitorResultCsv,
  competitorResultContext,
} from "./competitorResultExport";
import type { KeywordGapPage } from "@/server/features/competitors/services/CompetitorsService";
const result: KeywordGapPage = {
  contractVersion: 2,
  source: "DataForSEO Labs",
  scope: {
    projectId: "p1",
    target: "blog.example.com",
    competitor: "rival.com",
    mode: "missing",
    locationCode: 2840,
    languageCode: "en",
    page: 1,
    pageSize: 100,
    minSearchVolume: null,
  },
  fetchedAt: "2026-10-01T12:00:00.000Z",
  hasMore: false,
  totalCount: null,
  rows: [
    {
      keyword: "=FORMULA()",
      searchVolume: null,
      cpc: 0.1234,
      keywordDifficulty: null,
      competition: null,
      targetRank: null,
      competitorRank: 3,
    },
    {
      keyword: "zero",
      searchVolume: 0,
      cpc: 0,
      keywordDifficulty: 0,
      competition: 0,
      targetRank: null,
      competitorRank: 4,
    },
  ],
};
describe("comparison result exports", () => {
  it("retains unknowns, actual zero, precision, formula safety and original captured scope", () => {
    const csv = buildCompetitorResultCsv(result);
    expect(csv).toContain(`"'=FORMULA()","","0.1234","","","","3"`);
    expect(csv).toContain('"zero","0","0","0","0","","4"');
    expect(csv).toContain(
      '"DataForSEO Labs","2026-10-01T12:00:00.000Z","p1","blog.example.com","rival.com","2840","en",""',
    );
  });
  it("uses the saved observation scope without inferring the current form", () => {
    expect(competitorResultContext(result)).toMatchObject({
      capturedAt: "2026-10-01T12:00:00.000Z",
      target: "blog.example.com",
      locationCode: 2840,
    });
  });
});
