import { describe, expect, it } from "vitest";
import { contentEvidenceCounts } from "./contentEvidence";
import { BriefTargets, quantile } from "./BriefTargets";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("Captured content target evidence", () => {
  it("renders missing heading coverage instead of an observed zero target", () => {
    const html = renderToStaticMarkup(
      createElement(BriefTargets, {
        wordCounts: [0],
        h2Counts: [],
        analyzedCount: 0,
        headingCountsUnavailable: 1,
        paaCount: 0,
        analysesPending: false,
      }),
    );
    expect(html).toContain("Heading count unavailable");
    expect(html).not.toContain("~0 H2 sections");
    expect(html).toContain("~0 words");
  });
  it("retains a reported zero in the observed word-count sample", () => {
    const counts = contentEvidenceCounts([
      { wordCount: 0, h2: [], h2Available: true },
      { wordCount: 1200, h2: ["Coffee"], h2Available: true },
    ]);
    expect(counts.wordCounts).toEqual([0, 1200]);
    expect(quantile(counts.wordCounts, 0.5)).toBe(600);
  });
  it("separates unreported heading evidence from explicitly reported empty headings", () => {
    const counts = contentEvidenceCounts([
      { wordCount: 500, h2: [], h2Available: false },
      { wordCount: 500, h2: [], h2Available: true },
      { wordCount: null, h2: ["Coffee"], h2Available: true },
    ]);
    expect(counts.h2Counts).toEqual([0, 1]);
  });
});
