import { describe, expect, it } from "vitest";
import {
  buildRecommendations,
  delta,
  formatPercent,
  positionDelta,
} from "./reportModel";

describe("delta helpers", () => {
  it("formats gains and losses", () => {
    expect(delta(120, 100)).toEqual({ text: "+20", good: true });
    expect(delta(80, 100)).toEqual({ text: "-20", good: false });
    expect(delta(0, 0)).toBeNull();
  });

  it("treats a lower average position as an improvement", () => {
    expect(positionDelta(8, 12)).toEqual({ text: "+4.0", good: true });
    expect(positionDelta(12, 8)).toEqual({ text: "-4.0", good: false });
    expect(positionDelta(0, 10)).toBeNull();
  });

  it("formats CTR fractions as percentages", () => {
    expect(formatPercent(0.0432)).toBe("4.3%");
  });
});

describe("buildRecommendations", () => {
  it("orders findings by impact and covers backlink losses", () => {
    const recommendations = buildRecommendations({
      strikingDistanceCount: 12,
      cannibalizationCount: 3,
      linkOpportunityCount: 5,
      newBacklinks: 2,
      lostBacklinks: 9,
      latestAuditAgeDays: 3,
      latestAuditFailed: false,
    });
    expect(recommendations).toHaveLength(4);
    expect(recommendations[0]).toContain("12 keywords");
    expect(recommendations[3]).toContain("reclamation");
  });

  it("suggests an audit when stale or missing and falls back to all-clear", () => {
    expect(
      buildRecommendations({
        strikingDistanceCount: 0,
        cannibalizationCount: 0,
        linkOpportunityCount: 0,
        newBacklinks: null,
        lostBacklinks: null,
        latestAuditAgeDays: null,
        latestAuditFailed: false,
      })[0],
    ).toContain("fresh site audit");

    expect(
      buildRecommendations({
        strikingDistanceCount: 0,
        cannibalizationCount: 0,
        linkOpportunityCount: 0,
        newBacklinks: null,
        lostBacklinks: null,
        latestAuditAgeDays: 10,
        latestAuditFailed: false,
      })[0],
    ).toContain("No urgent issues");
  });
});
