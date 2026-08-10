import { describe, expect, it, vi } from "vitest";
import {
  buildCompetitorColumns,
  formatAvgPosition,
  formatBeatsYouOn,
  formatCoveragePercent,
  formatCount,
  formatPositionDelta,
} from "./CompetitorsTableColumns";

describe("formatCount", () => {
  it("renders a null metric as an em dash, never 0", () => {
    expect(formatCount(null)).toBe("—");
  });

  it("rounds and localizes a known count", () => {
    expect(formatCount(12345)).toBe("12,345");
  });
});

describe("formatAvgPosition", () => {
  it("renders null as an em dash", () => {
    expect(formatAvgPosition(null)).toBe("—");
  });

  it("formats to one decimal", () => {
    expect(formatAvgPosition(4.567)).toBe("4.6");
  });
});

describe("formatBeatsYouOn", () => {
  it("renders null as an em dash rather than '0 of N' -- a pinned domain discovery missed has no measurement, not a zero", () => {
    expect(formatBeatsYouOn(null, 20)).toBe("—");
  });

  it("renders the count against the seed size", () => {
    expect(formatBeatsYouOn(7, 20)).toBe("7 of 20");
  });

  it("still reports a genuine zero honestly, once it is a real measurement", () => {
    expect(formatBeatsYouOn(0, 20)).toBe("0 of 20");
  });
});

describe("formatCoveragePercent", () => {
  it("renders null as an em dash, never 0% -- this is the exact bug decision 4 forbids", () => {
    expect(formatCoveragePercent(null)).toBe("—");
  });

  it("rounds a coverage fraction to a whole percent", () => {
    expect(formatCoveragePercent(0.634)).toBe("63%");
  });
});

describe("formatPositionDelta", () => {
  it("renders null as an em dash", () => {
    expect(formatPositionDelta(null)).toBe("—");
  });

  it("keeps the sign already produced for a negative delta (ahead of the client)", () => {
    expect(formatPositionDelta(-7.6)).toBe("-7.6");
  });

  it("adds an explicit + sign for a positive delta (behind the client)", () => {
    expect(formatPositionDelta(3.2)).toBe("+3.2");
  });

  it("adds no sign at exactly zero", () => {
    expect(formatPositionDelta(0)).toBe("0.0");
  });
});

describe("buildCompetitorColumns", () => {
  const actions = {
    onCompareCompetitor: vi.fn(),
    onPin: vi.fn(),
    onUnpin: vi.fn(),
    onExclude: vi.fn(),
    pendingDomain: null,
  };

  it("shows the keyword-seeded headline columns for discoveryMode 'serp', and drops the always-null Shared Keywords column", () => {
    const ids = buildCompetitorColumns({
      discoveryMode: "serp",
      seedSize: 20,
      actions,
    }).map((column) => column.id);

    expect(ids).toEqual([
      "domain",
      "beatsYouOn",
      "coverage",
      "positionDelta",
      "avgPosition",
      "estTraffic",
      "actions",
    ]);
    expect(ids).not.toContain("intersections");
  });

  it("leaves today's columns unchanged for discoveryMode 'domain'", () => {
    const ids = buildCompetitorColumns({
      discoveryMode: "domain",
      seedSize: 0,
      actions,
    }).map((column) => column.id);

    expect(ids).toEqual([
      "domain",
      "intersections",
      "avgPosition",
      "organicKeywords",
      "organicTraffic",
      "actions",
    ]);
    expect(ids).not.toContain("beatsYouOn");
    expect(ids).not.toContain("coverage");
    expect(ids).not.toContain("positionDelta");
  });

  it("puts 'Beats you on' immediately after Competitor, as the headline column", () => {
    const columns = buildCompetitorColumns({
      discoveryMode: "serp",
      seedSize: 20,
      actions,
    });

    expect(columns[0].id).toBe("domain");
    expect(columns[1].id).toBe("beatsYouOn");
  });
});
