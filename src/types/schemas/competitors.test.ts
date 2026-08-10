import { describe, expect, it } from "vitest";
import { competitorsPageSchema } from "./competitors";

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
});
