import { describe, expect, it } from "vitest";
import { buildPositioningMapBubbles } from "./buildPositioningMapBubbles";
import type { CompetitorRow } from "@/types/schemas/competitors";

const row = (
  domain: string,
  overrides: Partial<CompetitorRow> = {},
): CompetitorRow => ({
  domain,
  avgPosition: 5,
  intersections: 10,
  organicKeywords: 100,
  organicTraffic: 500,
  coverage: null,
  beatsYouCount: null,
  positionDelta: null,
  source: "domain",
  pinned: false,
  category: null,
  ...overrides,
});

const overview = (
  overrides: Partial<{
    domain: string;
    hasData: boolean;
    organicKeywords: number | null;
    organicTraffic: number | null;
  }> = {},
) => ({
  domain: "acme.com",
  hasData: true,
  organicKeywords: 5000,
  organicTraffic: 20000,
  ...overrides,
});

describe("buildPositioningMapBubbles", () => {
  it("is unavailable in serp mode, even with plenty of comparable-looking rows and a real overview", () => {
    const result = buildPositioningMapBubbles({
      rows: [row("a.com"), row("b.com"), row("c.com")],
      discoveryMode: "serp",
      overview: overview(),
    });

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("is unavailable in serp mode even with zero rows and no overview", () => {
    const result = buildPositioningMapBubbles({
      rows: [],
      discoveryMode: "serp",
      overview: null,
    });

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("is insufficient in domain mode with no plottable rows and no overview", () => {
    const result = buildPositioningMapBubbles({
      rows: [],
      discoveryMode: "domain",
      overview: null,
    });

    expect(result).toEqual({ kind: "insufficient" });
  });

  it("is insufficient in domain mode with only one plottable row and no overview", () => {
    const result = buildPositioningMapBubbles({
      rows: [row("a.com")],
      discoveryMode: "domain",
      overview: null,
    });

    expect(result).toEqual({ kind: "insufficient" });
  });

  it("drops rows missing organicKeywords or organicTraffic before counting toward the minimum", () => {
    const result = buildPositioningMapBubbles({
      rows: [
        row("a.com", { organicKeywords: null }),
        row("b.com", { organicTraffic: null }),
      ],
      discoveryMode: "domain",
      overview: null,
    });

    expect(result).toEqual({ kind: "insufficient" });
  });

  it("builds a chart once a single competitor plus the target's own bubble clears the minimum", () => {
    const result = buildPositioningMapBubbles({
      rows: [row("a.com", { intersections: 30 })],
      discoveryMode: "domain",
      overview: overview(),
    });

    expect(result.kind).toBe("chart");
    if (result.kind !== "chart") throw new Error("expected chart");
    expect(result.bubbles).toEqual([
      {
        domain: "a.com",
        keywords: 100,
        traffic: 500,
        overlap: 30,
        isTarget: false,
      },
      {
        domain: "acme.com (you)",
        keywords: 5000,
        traffic: 20000,
        // maxOverlap = max(1, 30) = 30, so the target's bubble is at least
        // as large as the biggest real rival, never a fixed 0.
        overlap: 30,
        isTarget: true,
      },
    ]);
  });

  it("sorts rivals by intersections descending before capping at 8", () => {
    const rows = [
      row("low.com", { intersections: 5 }),
      row("high.com", { intersections: 90 }),
      row("mid.com", { intersections: 40 }),
    ];

    const result = buildPositioningMapBubbles({
      rows,
      discoveryMode: "domain",
      overview: null,
    });

    expect(result.kind).toBe("chart");
    if (result.kind !== "chart") throw new Error("expected chart");
    expect(result.bubbles.map((b) => b.domain)).toEqual([
      "high.com",
      "mid.com",
      "low.com",
    ]);
  });

  it("caps rival bubbles at 8, but the target's own bubble is never counted against that cap", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(`rival-${i}.com`, { intersections: 12 - i }),
    );

    const result = buildPositioningMapBubbles({
      rows,
      discoveryMode: "domain",
      overview: overview(),
    });

    expect(result.kind).toBe("chart");
    if (result.kind !== "chart") throw new Error("expected chart");
    // 8 rivals + 1 target bubble = 9, not capped to 8.
    expect(result.bubbles).toHaveLength(9);
    expect(result.bubbles.at(-1)?.isTarget).toBe(true);
  });

  it("omits the target's bubble when the overview has no data", () => {
    const result = buildPositioningMapBubbles({
      rows: [row("a.com"), row("b.com")],
      discoveryMode: "domain",
      overview: overview({ hasData: false }),
    });

    expect(result.kind).toBe("chart");
    if (result.kind !== "chart") throw new Error("expected chart");
    expect(result.bubbles.some((b) => b.isTarget)).toBe(false);
  });

  it("omits the target's bubble when the overview is missing either metric, never fabricating a 0", () => {
    const result = buildPositioningMapBubbles({
      rows: [row("a.com"), row("b.com")],
      discoveryMode: "domain",
      overview: overview({ organicTraffic: null }),
    });

    expect(result.kind).toBe("chart");
    if (result.kind !== "chart") throw new Error("expected chart");
    expect(result.bubbles.some((b) => b.isTarget)).toBe(false);
  });

  it("gives the target's bubble overlap 1, not 0, when every rival has a null/zero intersections", () => {
    const result = buildPositioningMapBubbles({
      rows: [row("a.com", { intersections: null })],
      discoveryMode: "domain",
      overview: overview(),
    });

    expect(result.kind).toBe("chart");
    if (result.kind !== "chart") throw new Error("expected chart");
    const target = result.bubbles.find((b) => b.isTarget);
    expect(target?.overlap).toBe(1);
  });
});
