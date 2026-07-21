import { describe, expect, it } from "vitest";
import {
  buildBacklinkNarrative,
  buildClickNarrative,
  buildKeywordNarrative,
  buildSummaryNarrative,
  buildTopPagesNarrative,
  describeChange,
} from "./reportNarrative";

const totals = { clicks: 273, impressions: 33616, ctr: 0.0081, position: 10.6 };
const prevTotals = {
  clicks: 363,
  impressions: 37227,
  ctr: 0.0098,
  position: 10.8,
};

describe("describeChange", () => {
  it("names the direction and magnitude", () => {
    expect(describeChange(90, 100)).toMatchObject({
      direction: "down",
      percent: 10,
    });
    expect(describeChange(90, 100).phrase).toBe("a slight decrease of 10%");
    expect(describeChange(125, 100).phrase).toBe("a notable increase of 25%");
    expect(describeChange(300, 100).phrase).toBe("a sharp increase of 200%");
  });

  it("treats sub-2% moves as flat so noise isn't reported as a trend", () => {
    expect(describeChange(101, 100)).toMatchObject({
      direction: "flat",
      phrase: "holding steady",
    });
  });

  it("handles a zero baseline without dividing by it", () => {
    expect(describeChange(50, 0)).toMatchObject({
      direction: "up",
      percent: null,
      phrase: "a new baseline this period",
    });
    expect(describeChange(0, 0)).toMatchObject({
      direction: "flat",
      percent: null,
    });
  });
});

describe("buildSummaryNarrative", () => {
  it("reports both declines honestly and cites the top page", () => {
    const paragraphs = buildSummaryNarrative({
      totals,
      prevTotals,
      topPage: { path: "/belgian-chocolate", impressions: 2580, clicks: 27 },
    });

    expect(paragraphs[0]).toContain("33,616 impressions");
    expect(paragraphs[0]).toContain("273 clicks");
    expect(paragraphs[0]).toContain("decrease");
    expect(paragraphs[0]).toContain("10.6");
    expect(paragraphs[1]).toContain("/belgian-chocolate");
    // Position moved 10.8 -> 10.6, an improvement of 0.2.
    expect(paragraphs[2]).toContain("improved by 0.2");
  });

  it("omits the position paragraph when the move is negligible", () => {
    const paragraphs = buildSummaryNarrative({
      totals,
      prevTotals: { ...prevTotals, position: 10.62 },
    });
    expect(paragraphs.some((p) => p.includes("Average position"))).toBe(false);
  });

  it("never claims work was performed on the client's behalf", () => {
    const text = buildSummaryNarrative({ totals, prevTotals }).join(" ");
    expect(text).not.toMatch(/we (automated|optimized|published|fixed)/i);
  });
});

describe("buildClickNarrative", () => {
  it("calls out a sub-1% CTR as a title/meta opportunity", () => {
    const text = buildClickNarrative({ totals, prevTotals }).join(" ");
    expect(text).toContain("0.81%");
    expect(text).toContain("meta descriptions");
  });

  it("switches to a protective framing once CTR clears 1%", () => {
    const text = buildClickNarrative({
      totals: { ...totals, ctr: 0.034 },
      prevTotals,
    }).join(" ");
    expect(text).toContain("earning the click");
  });
});

describe("buildTopPagesNarrative", () => {
  it("totals the set and leads with the best page", () => {
    const text = buildTopPagesNarrative([
      { path: "/a", clicks: 27, impressions: 2580 },
      { path: "/b", clicks: 10, impressions: 979 },
    ]).join(" ");
    expect(text).toContain("top 2 pages");
    expect(text).toContain("37 clicks");
    expect(text).toContain("/a");
  });

  it("returns nothing when there are no pages", () => {
    expect(buildTopPagesNarrative([])).toEqual([]);
  });

  it("reads correctly with a single page", () => {
    const text = buildTopPagesNarrative([
      { path: "/a", clicks: 27, impressions: 2580 },
    ]).join(" ");
    expect(text).toContain("Your best page this period is /a");
    expect(text).not.toContain("top 1 pages");
  });
});

describe("buildKeywordNarrative", () => {
  it("mentions momentum when position improved", () => {
    const text = buildKeywordNarrative(
      [{ query: "bloe", clicks: 1, impressions: 2021 }],
      0.2,
    ).join(" ");
    expect(text).toContain('"bloe"');
    expect(text).toContain("improved by 0.2");
  });

  it("points at cannibalization when position fell", () => {
    const text = buildKeywordNarrative(
      [{ query: "bloe", clicks: 1, impressions: 2021 }],
      -0.6,
    ).join(" ");
    expect(text).toContain("fell by 0.6");
    expect(text).toContain("competing-pages");
  });
});

describe("buildBacklinkNarrative", () => {
  it("summarises the profile and flags broken links", () => {
    const text = buildBacklinkNarrative({
      rank: 44,
      backlinks: 6286,
      referringDomains: 439,
      spamScore: 11,
      brokenBacklinks: 46,
    }).join(" ");
    expect(text).toContain("6,286 backlinks");
    expect(text).toContain("439 referring domains");
    expect(text).toContain("domain rank of 44");
    expect(text).toContain("46 backlinks currently point");
  });

  it("stays quiet when there is no backlink data at all", () => {
    expect(
      buildBacklinkNarrative({
        rank: null,
        backlinks: null,
        referringDomains: null,
        spamScore: null,
        brokenBacklinks: null,
      }),
    ).toEqual([]);
  });

  it("only raises spam score when it is actually high", () => {
    const clean = buildBacklinkNarrative({
      rank: 44,
      backlinks: 100,
      referringDomains: 10,
      spamScore: 11,
      brokenBacklinks: 0,
    }).join(" ");
    expect(clean).not.toContain("spam score");

    const dirty = buildBacklinkNarrative({
      rank: 44,
      backlinks: 100,
      referringDomains: 10,
      spamScore: 42,
      brokenBacklinks: 0,
    }).join(" ");
    expect(dirty).toContain("spam score of 42%");
  });
});
