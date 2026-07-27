import { describe, expect, it } from "vitest";
import { buildSuggestions, compactNumber } from "./suggestionModel";
import type { FreeSignals } from "./types";

const EMPTY: FreeSignals = {
  queryTotals: [],
  queryPages: [],
  strikingDistance: [],
  ctrOpportunities: [],
  savedKeywords: [],
};

describe("compactNumber", () => {
  it("abbreviates thousands", () => {
    expect(compactNumber(2400)).toBe("2.4k");
  });

  it("rounds small numbers whole", () => {
    expect(compactNumber(7.4)).toBe("7");
  });
});

describe("buildSuggestions", () => {
  it("returns nothing when there is no data", () => {
    expect(buildSuggestions(EMPTY, "striking-distance")).toEqual([]);
  });

  describe("striking-distance", () => {
    it("keeps only positions 4-20, ranked by impressions", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        strikingDistance: [
          { query: "top", page: "/a", clicks: 0, impressions: 50, position: 2 },
          {
            query: "mid",
            page: "/b",
            clicks: 0,
            impressions: 900,
            position: 7,
          },
          {
            query: "far",
            page: "/c",
            clicks: 0,
            impressions: 80,
            position: 40,
          },
          {
            query: "low",
            page: "/d",
            clicks: 0,
            impressions: 120,
            position: 12,
          },
        ],
      };

      expect(buildSuggestions(signals, "striking-distance")).toEqual([
        { value: "mid", hint: "pos 7 · 900 impr", weight: 900 },
        { value: "low", hint: "pos 12 · 120 impr", weight: 120 },
      ]);
    });
  });

  describe("under-clicked", () => {
    it("ranks by missed clicks", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        ctrOpportunities: [
          {
            query: "small",
            page: "/a",
            clicks: 1,
            impressions: 300,
            ctr: 0.003,
            position: 4,
            missedClicks: 9,
          },
          {
            query: "big",
            page: "/b",
            clicks: 2,
            impressions: 1240,
            ctr: 0.004,
            position: 3,
            missedClicks: 40,
          },
        ],
      };

      expect(buildSuggestions(signals, "under-clicked")).toEqual([
        { value: "big", hint: "40 clicks missed · pos 3", weight: 40 },
        { value: "small", hint: "9 clicks missed · pos 4", weight: 9 },
      ]);
    });
  });

  describe("high-volume", () => {
    it("prefers saved keywords with volume", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        savedKeywords: [
          { keyword: "cheap", searchVolume: 100 },
          { keyword: "rich", searchVolume: 5400 },
        ],
      };

      expect(buildSuggestions(signals, "high-volume")).toEqual([
        { value: "rich", hint: "5.4k/mo saved", weight: 5400 },
        { value: "cheap", hint: "100/mo saved", weight: 100 },
      ]);
    });

    it("falls back to Search Console impressions when nothing is saved", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        queryTotals: [
          { query: "seen", clicks: 3, impressions: 800, position: 9 },
        ],
      };

      expect(buildSuggestions(signals, "high-volume")).toEqual([
        { value: "seen", hint: "800 impr · pos 9", weight: 800 },
      ]);
    });

    it("ignores saved keywords with no volume when Search Console has data", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        savedKeywords: [{ keyword: "unknown", searchVolume: null }],
        queryTotals: [
          { query: "seen", clicks: 3, impressions: 800, position: 9 },
        ],
      };

      expect(buildSuggestions(signals, "high-volume")).toEqual([
        { value: "seen", hint: "800 impr · pos 9", weight: 800 },
      ]);
    });
  });

  describe("topic-gap", () => {
    it("surfaces queries with impressions whose best page ranks past the first page", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        queryTotals: [
          { query: "owned", clicks: 40, impressions: 900, position: 3 },
          { query: "gap", clicks: 0, impressions: 700, position: 34 },
          { query: "noise", clicks: 0, impressions: 4, position: 60 },
        ],
      };

      expect(buildSuggestions(signals, "topic-gap")).toEqual([
        { value: "gap", hint: "700 impr · best page ranks #34", weight: 700 },
      ]);
    });
  });

  describe("own-pages", () => {
    it("ranks distinct pages by clicks", () => {
      const signals: FreeSignals = {
        ...EMPTY,
        queryPages: [
          {
            query: "a",
            page: "/one",
            clicks: 10,
            impressions: 100,
            ctr: 0.1,
            position: 3,
          },
          {
            query: "b",
            page: "/one",
            clicks: 5,
            impressions: 60,
            ctr: 0.08,
            position: 4,
          },
          {
            query: "c",
            page: "/two",
            clicks: 30,
            impressions: 400,
            ctr: 0.07,
            position: 2,
          },
        ],
      };

      expect(buildSuggestions(signals, "own-pages")).toEqual([
        { value: "/two", hint: "30 clicks", weight: 30 },
        { value: "/one", hint: "15 clicks", weight: 15 },
      ]);
    });
  });

  it("honours the limit", () => {
    const signals: FreeSignals = {
      ...EMPTY,
      savedKeywords: [
        { keyword: "a", searchVolume: 5 },
        { keyword: "b", searchVolume: 4 },
        { keyword: "c", searchVolume: 3 },
      ],
    };

    expect(buildSuggestions(signals, "high-volume", 2)).toHaveLength(2);
  });
});
