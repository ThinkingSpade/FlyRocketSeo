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

describe("buildRecommendations completeness states", () => {
  // A settled, complete, genuinely-empty run: the only case the confident
  // all-clear is true.
  const noFindings = {
    strikingDistanceCount: 0,
    cannibalizationCount: 0,
    linkOpportunityCount: 0,
    newBacklinks: 1,
    lostBacklinks: 0,
    latestAuditAgeDays: 3,
    latestAuditFailed: false,
  };

  it("declares an all-clear only when the data was complete", () => {
    const [only] = buildRecommendations(noFindings);
    expect(only).toContain("No urgent issues detected");
  });

  it("refuses the all-clear when a source was incomplete", () => {
    // Missing or capped GSC previously produced the confident sentence, because
    // absent data made every finding count zero.
    const [only] = buildRecommendations({ ...noFindings, gscIncomplete: true });
    expect(only).not.toContain("No urgent issues detected");
    expect(only).toContain("incomplete");
  });

  it("says loading rather than inventing a failure while pending", () => {
    // This page can be PRINTED mid-load. Claiming the data "was incomplete"
    // about a request still in flight is its own false statement, frozen into a
    // PDF -- and the confident all-clear is worse.
    const [only] = buildRecommendations({
      ...noFindings,
      gscPending: true,
      gscIncomplete: false,
    });
    expect(only).toContain("still loading");
    expect(only).not.toContain("No urgent issues detected");
    expect(only).not.toContain("incomplete");
  });

  it("prefers the loading wording over the incomplete wording", () => {
    const [only] = buildRecommendations({
      ...noFindings,
      gscPending: true,
      gscIncomplete: true,
    });
    expect(only).toContain("still loading");
  });

  it("never replaces real findings with a completeness note", () => {
    const recommendations = buildRecommendations({
      ...noFindings,
      strikingDistanceCount: 4,
      gscPending: true,
    });
    expect(recommendations[0]).toContain("4 keywords");
    expect(recommendations.join(" ")).not.toContain("still loading");
  });
});
