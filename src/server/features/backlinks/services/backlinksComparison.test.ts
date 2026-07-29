import { describe, expect, it } from "vitest";
import { buildComparison, type ComparisonInputs } from "./backlinksComparison";
import { normalizeComparisonTarget } from "@/shared/backlink-targets";

const EMPTY: Omit<ComparisonInputs, "you" | "competitors"> = {
  ranks: [],
  backlinks: [],
  referringDomains: [],
  newLost: [],
  spamScores: [],
};

describe("normalizeComparisonTarget", () => {
  it("strips scheme, www, case and trailing slash", () => {
    expect(normalizeComparisonTarget("HTTPS://www.Example.com/")).toBe(
      "example.com",
    );
  });

  it("returns an empty string for missing values", () => {
    expect(normalizeComparisonTarget(null)).toBe("");
    expect(normalizeComparisonTarget(undefined)).toBe("");
  });
});

describe("buildComparison", () => {
  it("always includes the analyzed domain, flagged as you", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: [],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].isYou).toBe(true);
  });

  it("correlates by echoed target, not array position", () => {
    // Every response comes back in a different order on purpose.
    const result = buildComparison({
      you: "deliotx.com",
      competitors: ["rival.com"],
      ranks: [
        { target: "rival.com", rank: 70 },
        { target: "deliotx.com", rank: 38 },
      ],
      backlinks: [
        { target: "deliotx.com", backlinks: 883 },
        { target: "rival.com", backlinks: 12000 },
      ],
      referringDomains: [
        { target: "rival.com", referring_domains: 2100 },
        { target: "deliotx.com", referring_domains: 310 },
      ],
      newLost: [],
      spamScores: [],
    });

    const you = result.rows.find((row) => row.isYou);
    expect(you?.rank).toBe(38);
    expect(you?.backlinks).toBe(883);
    expect(you?.referringDomains).toBe(310);
  });

  it("matches targets DataForSEO echoed back in a different form", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "https://www.deliotx.com/",
      competitors: [],
      ranks: [{ target: "deliotx.com", rank: 38 }],
    });
    expect(result.rows[0].rank).toBe(38);
    expect(result.rows[0].target).toBe("deliotx.com");
  });

  it("sorts as a leaderboard on referring domains", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: ["small.com", "big.com"],
      referringDomains: [
        { target: "deliotx.com", referring_domains: 310 },
        { target: "small.com", referring_domains: 50 },
        { target: "big.com", referring_domains: 2100 },
      ],
    });
    expect(result.rows.map((row) => row.target)).toEqual([
      "big.com",
      "deliotx.com",
      "small.com",
    ]);
  });

  it("reports your position and the gap to the leader", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: ["big.com"],
      referringDomains: [
        { target: "deliotx.com", referring_domains: 310 },
        { target: "big.com", referring_domains: 2100 },
      ],
    });
    expect(result.yourPosition).toBe(2);
    expect(result.totalTargets).toBe(2);
    expect(result.leader).toBe("big.com");
    expect(result.gapToLeader).toBe(1790);
  });

  it("reports a zero gap when you lead", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: ["small.com"],
      referringDomains: [
        { target: "deliotx.com", referring_domains: 310 },
        { target: "small.com", referring_domains: 50 },
      ],
    });
    expect(result.yourPosition).toBe(1);
    expect(result.gapToLeader).toBe(0);
  });

  it("sorts targets with no data last instead of treating them as zero", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: ["unknown.com"],
      referringDomains: [{ target: "deliotx.com", referring_domains: 0 }],
    });
    expect(result.rows.map((row) => row.target)).toEqual([
      "deliotx.com",
      "unknown.com",
    ]);
    expect(result.rows[1].referringDomains).toBeNull();
    // The unknown row is not ranked, so it does not inflate the field size.
    expect(result.totalTargets).toBe(1);
  });

  it("leaves your position null when you have no referring-domain count", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: ["big.com"],
      referringDomains: [{ target: "big.com", referring_domains: 2100 }],
    });
    expect(result.yourPosition).toBeNull();
    expect(result.gapToLeader).toBeNull();
  });

  it("nets referring domains won against lost", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: [],
      newLost: [
        {
          target: "deliotx.com",
          new_referring_domains: 28,
          lost_referring_domains: 11,
        },
      ],
    });
    expect(result.rows[0].netReferringDomains).toBe(17);
  });

  it("keeps net null when neither side was reported", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: [],
      newLost: [{ target: "deliotx.com" }],
    });
    expect(result.rows[0].netReferringDomains).toBeNull();
  });

  it("treats one missing side of the net as zero", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: [],
      newLost: [{ target: "deliotx.com", new_referring_domains: 5 }],
    });
    expect(result.rows[0].netReferringDomains).toBe(5);
  });

  it("collapses a competitor that is really the analyzed domain", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: ["https://www.deliotx.com"],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].isYou).toBe(true);
  });

  it("deduplicates repeated competitors", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: ["rival.com", "www.rival.com", "rival.com"],
    });
    expect(result.rows).toHaveLength(2);
  });

  it("drops blank competitor entries", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: ["", "   "],
    });
    expect(result.rows).toHaveLength(1);
  });

  it("does not let a later empty duplicate overwrite real numbers", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: [],
      ranks: [
        { target: "deliotx.com", rank: 38 },
        { target: "deliotx.com", rank: null },
      ],
    });
    expect(result.rows[0].rank).toBe(38);
  });

  it("carries spam score and nofollow counts onto the row", () => {
    const result = buildComparison({
      ...EMPTY,
      you: "deliotx.com",
      competitors: [],
      referringDomains: [
        {
          target: "deliotx.com",
          referring_domains: 310,
          referring_domains_nofollow: 62,
        },
      ],
      spamScores: [{ target: "deliotx.com", spam_score: 14 }],
    });
    expect(result.rows[0].spamScore).toBe(14);
    expect(result.rows[0].referringDomainsNofollow).toBe(62);
  });
});
