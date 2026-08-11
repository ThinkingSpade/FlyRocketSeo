import { describe, expect, it } from "vitest";
import { competitorsPageSchema, isCompetitorRow } from "./competitors";

describe("competitorsPageSchema", () => {
  it("still parses a run stored before the smart-discovery fields existed", () => {
    const legacy = {
      rows: [
        {
          domain: "vending.com",
          avgPosition: 12.6,
          intersections: 27,
          organicKeywords: 3865,
          organicTraffic: 215110,
        },
      ],
      totalCount: 9,
      fetchedAt: "2026-08-01T00:00:00.000Z",
    };

    const parsed = competitorsPageSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
    // A legacy row carries no discovery metrics, and must not pretend to.
    expect(parsed.data?.rows[0].beatsYouCount).toBeNull();
    expect(parsed.data?.rows[0].source).toBe("domain");
    expect(parsed.data?.rows[0].pinned).toBe(false);
    // Page-level explanation fields a legacy run predates.
    expect(parsed.data?.seedSize).toBe(0);
    expect(parsed.data?.hiddenCount).toBe(0);
    expect(parsed.data?.discoveryMode).toBe("domain");
    expect(parsed.data?.seedTruncated).toBe(false);
  });

  it("parses a row produced by keyword-seeded discovery", () => {
    const parsed = competitorsPageSchema.safeParse({
      rows: [
        {
          domain: "avfusa.com",
          avgPosition: 4.2,
          intersections: null,
          organicKeywords: null,
          organicTraffic: 1200,
          coverage: 0.775,
          beatsYouCount: 31,
          positionDelta: -7.6,
          source: "serp",
          pinned: true,
        },
      ],
      totalCount: 1,
      fetchedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.rows[0].beatsYouCount).toBe(31);
  });

  it("defaults category to null for a run stored before the relevance classifier existed", () => {
    // A row cached before this batch shipped carries no `category` at all --
    // it must still parse, and must read as "treated as a real competitor"
    // (null), never as excluded from the main table by a field it predates.
    const legacy = {
      rows: [
        {
          domain: "vending.com",
          avgPosition: 12.6,
          intersections: 27,
          organicKeywords: 3865,
          organicTraffic: 215110,
        },
      ],
      totalCount: 9,
      fetchedAt: "2026-08-01T00:00:00.000Z",
    };

    const parsed = competitorsPageSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.rows[0].category).toBeNull();
  });

  it("parses a row carrying a known classifier category", () => {
    const parsed = competitorsPageSchema.safeParse({
      rows: [
        {
          domain: "youtube.com",
          avgPosition: 4.2,
          intersections: null,
          organicKeywords: null,
          organicTraffic: 1200,
          coverage: 0.15,
          beatsYouCount: 6,
          positionDelta: -7.6,
          source: "serp",
          pinned: false,
          category: "video",
        },
      ],
      totalCount: 1,
      fetchedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.rows[0].category).toBe("video");
  });

  it("rejects a category outside the known set rather than silently accepting it", () => {
    const parsed = competitorsPageSchema.safeParse({
      rows: [
        {
          domain: "example.com",
          avgPosition: null,
          intersections: null,
          organicKeywords: null,
          organicTraffic: null,
          category: "not-a-real-category",
        },
      ],
      totalCount: 1,
      fetchedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("isCompetitorRow", () => {
  it("treats an unclassified row (category null) as a competitor", () => {
    expect(isCompetitorRow({ category: null, pinned: false })).toBe(true);
  });

  it("demotes a classified, unpinned row", () => {
    expect(isCompetitorRow({ category: "video", pinned: false })).toBe(false);
  });

  it("lets a pin override a classification -- the operator's judgement wins", () => {
    expect(isCompetitorRow({ category: "video", pinned: true })).toBe(true);
  });

  it("keeps a pinned, unclassified row a competitor (both signals agree)", () => {
    expect(isCompetitorRow({ category: null, pinned: true })).toBe(true);
  });
});
