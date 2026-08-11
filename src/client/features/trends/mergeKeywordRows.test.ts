import { describe, expect, it } from "vitest";
import { mergeKeywordRows } from "./mergeKeywordRows";
import type { TrendingOpportunity } from "./opportunityActions";
import type { KeywordDiscoveryKeyword } from "@/types/schemas/keyword-discovery";

function gscRow(over: Partial<TrendingOpportunity> = {}): TrendingOpportunity {
  return {
    keyword: "vending machines dallas",
    action: "fix",
    reason: "You average #7.",
    position: 7.4,
    page: "https://americavending.com/dallas",
    pageShare: 0.9,
    momentum: {
      query: "vending machines dallas",
      impressions: 400,
      prevImpressions: 250,
      percent: 60,
      direction: "rising",
    },
    score: 640,
    ...over,
  };
}

function labsRow(
  over: Partial<KeywordDiscoveryKeyword> = {},
): KeywordDiscoveryKeyword {
  return {
    keyword: "vending machines dallas",
    position: 5,
    searchVolume: 1300,
    traffic: 88.1,
    cpc: 4.2,
    url: "https://americavending.com/dallas",
    relativeUrl: "/dallas",
    keywordDifficulty: 41,
    ...over,
  };
}

describe("mergeKeywordRows", () => {
  it("produces ONE row for a keyword both sources know", () => {
    const rows = mergeKeywordRows({ gsc: [gscRow()], labs: [labsRow()] });
    expect(rows).toHaveLength(1);
  });

  it("keeps the two rank numbers in separate fields and never blends them", () => {
    const [row] = mergeKeywordRows({ gsc: [gscRow()], labs: [labsRow()] });
    expect(row.serpRank).toBe(5);
    expect(row.gscAveragePosition).toBe(7.4);
    // The blended values a careless implementation would produce:
    expect(row.serpRank).not.toBe(6.2); // mean
    expect(row.serpRank).not.toBe(7.4); // GSC leaking into the SERP field
  });

  it("matches case-insensitively and on trimmed whitespace", () => {
    const rows = mergeKeywordRows({
      gsc: [gscRow({ keyword: "  Vending Machines Dallas " })],
      labs: [labsRow({ keyword: "vending machines dallas" })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].serpRank).toBe(5);
    expect(rows[0].gscAveragePosition).toBe(7.4);
  });

  it("gives a Labs-only keyword no trend and no action", () => {
    const [row] = mergeKeywordRows({
      gsc: [],
      labs: [labsRow({ keyword: "breakroom supplies fort worth" })],
    });
    expect(row.momentum).toBeNull();
    expect(row.action).toBeNull();
    expect(row.impressions).toBeNull();
    expect(row.gscAveragePosition).toBeNull();
  });

  it("gives a GSC-only keyword no SERP rank and no volume", () => {
    const [row] = mergeKeywordRows({
      gsc: [gscRow({ keyword: "office snack refreshment program" })],
      labs: [],
    });
    expect(row.serpRank).toBeNull();
    expect(row.searchVolume).toBeNull();
    expect(row.keywordDifficulty).toBeNull();
    expect(row.gscAveragePosition).toBe(7.4);
    expect(row.action).toBe("fix");
  });

  it("keeps low-impression GSC rows, which the card used to hide entirely", () => {
    const rows = mergeKeywordRows({
      gsc: [
        gscRow({
          keyword: "dfw vending",
          action: "watch",
          momentum: {
            query: "dfw vending",
            impressions: 4,
            prevImpressions: null,
            percent: null,
            direction: "unknown",
          },
        }),
      ],
      labs: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].impressions).toBe(4);
  });

  it("sorts by search volume descending with unknown volume last", () => {
    const rows = mergeKeywordRows({
      gsc: [gscRow({ keyword: "gsc only" })],
      labs: [
        labsRow({ keyword: "small", searchVolume: 90 }),
        labsRow({ keyword: "big", searchVolume: 5000 }),
      ],
    });
    expect(rows.map((row) => row.keyword)).toEqual([
      "big",
      "small",
      "gsc only",
    ]);
  });

  it("marks a Labs URL as the ranking page, with no impression share", () => {
    const [row] = mergeKeywordRows({ gsc: [gscRow()], labs: [labsRow()] });
    expect(row.url).toBe("https://americavending.com/dallas");
    expect(row.urlSource).toBe("serp");
    // The GSC share describes GSC's guess, and there is no guess here.
    expect(row.pageShare).toBeNull();
  });

  it("marks a GSC-only URL as an impression estimate and carries its share", () => {
    // The honesty this field exists for: 0.42 means no single page owns the
    // query (opportunityActions.ts treats anything under 0.6 that way), so
    // presenting this URL the same way as a Labs ranking URL is a guess
    // dressed as a fact.
    const [row] = mergeKeywordRows({
      gsc: [
        gscRow({
          keyword: "office snack refreshment program",
          page: "https://americavending.com/snacks",
          pageShare: 0.42,
        }),
      ],
      labs: [],
    });
    expect(row.url).toBe("https://americavending.com/snacks");
    expect(row.urlSource).toBe("impressions");
    expect(row.pageShare).toBe(0.42);
  });

  it("falls back to the GSC page when Labs knows the keyword but names no URL", () => {
    const [row] = mergeKeywordRows({
      gsc: [gscRow()],
      labs: [labsRow({ url: null })],
    });
    expect(row.url).toBe("https://americavending.com/dallas");
    expect(row.urlSource).toBe("impressions");
    expect(row.pageShare).toBe(0.9);
  });

  it("reports no URL source when neither provider names a page", () => {
    const [row] = mergeKeywordRows({
      gsc: [gscRow({ page: null, pageShare: null })],
      labs: [labsRow({ url: null })],
    });
    expect(row.url).toBeNull();
    expect(row.urlSource).toBeNull();
  });

  it("returns an empty array when neither source has anything", () => {
    expect(mergeKeywordRows({ gsc: [], labs: [] })).toEqual([]);
  });
});
