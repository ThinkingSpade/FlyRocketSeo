import { describe, expect, it } from "vitest";
import {
  compareOpportunityEvidence,
  detectDecliningPages,
  detectInternalLink,
} from "./detectors";
import { evidence } from "./evidence.fixture";

describe("evidence-backed opportunities", () => {
  it.each([
    "2026-10-11T01:00:00Z",
    "2026-10-10T23:30:00-07:00",
    "2026-10-11T06:59:59Z",
  ])("excludes baseline overlap in Pacific time at %s", (implementedAt) => {
    const after = evidence({
      window: { startDate: "2026-10-18", endDate: "2026-11-14" },
      current: { clicks: 70, impressions: 1300, position: 6 },
    });
    expect(
      compareOpportunityEvidence(evidence(), after, implementedAt).availability,
    ).toBe("incomparable");
  });
  it("accepts the first Pacific day after the baseline", () => {
    const after = evidence({
      window: { startDate: "2026-10-18", endDate: "2026-11-14" },
      current: { clicks: 70, impressions: 1300, position: 6 },
    });
    expect(
      compareOpportunityEvidence(evidence(), after, "2026-10-11T07:00:00Z")
        .availability,
    ).toBe("measured");
  });
  it("finds a supported decline without inventing its cause or click gain", () => {
    const findings = detectDecliningPages([evidence()]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "page_decline",
      url: "https://example.com/article",
      priorityBand: "medium",
    });
    expect(findings[0].evidence.current.clicks).toBe(50);
    expect(findings[0].limitations.join(" ")).toMatch(/seasonality/i);
  });
  it("deduplicates identical evidence and sorts deterministically", () => {
    expect(detectDecliningPages([evidence(), evidence()])).toHaveLength(1);
  });
  it.each([
    {
      coverage: {
        finalData: true,
        currentRows: 1000,
        previousRows: 1000,
        truncated: true,
        complete: false,
      },
    },
    { current: { clicks: NaN, impressions: 1000, position: 8 } },
    { previous: { clicks: 3, impressions: 20, position: 7 } },
    { window: { startDate: "2026-09-14", endDate: "2026-10-10" } },
  ])(
    "does not diagnose invalid, sampled, tiny or mismatched periods",
    (change) => {
      expect(detectDecliningPages([evidence(change)])).toEqual([]);
    },
  );
  it("measures equal matching complete post-implementation windows as association", () => {
    const baseline = evidence();
    const after = evidence({
      window: { startDate: "2026-10-18", endDate: "2026-11-14" },
      current: { clicks: 70, impressions: 1300, position: 6 },
    });
    expect(
      compareOpportunityEvidence(baseline, after, "2026-10-11T12:00:00Z"),
    ).toMatchObject({
      availability: "measured",
      clicksChange: 20,
      impressionsChange: 300,
    });
  });
  it.each([
    "siteUrl",
    "connectedBy",
    "country",
    "device",
    "searchType",
    "projectId",
    "target",
  ] as const)("rejects changed %s measurement scope", (key) => {
    const after = evidence({
      scope: { ...evidence().scope, [key]: "changed" },
      window: { startDate: "2026-10-18", endDate: "2026-11-14" },
    });
    expect(
      compareOpportunityEvidence(evidence(), after, "2026-10-11T12:00:00Z")
        .availability,
    ).toBe("incomparable");
  });
  it("keeps incomplete or low-volume outcomes pending, including a missing page", () => {
    const after = evidence({
      window: { startDate: "2026-10-18", endDate: "2026-11-14" },
      current: { clicks: 0, impressions: 0, position: null },
      coverage: {
        finalData: true,
        currentRows: 0,
        previousRows: 28,
        truncated: false,
        complete: true,
      },
    });
    expect(
      compareOpportunityEvidence(evidence(), after, "2026-10-11T12:00:00Z")
        .availability,
    ).toBe("insufficient");
  });
  it("does not measure a pre-implementation or unequal-weekday window", () => {
    expect(
      compareOpportunityEvidence(evidence(), evidence(), "2026-10-11T12:00:00Z")
        .availability,
    ).toBe("incomparable");
  });
  it("requires actual unlinked source text and an existing-link graph", () => {
    const input = {
      evidence: evidence(),
      phrase: "coffee service",
      destination: {
        url: "https://example.com/service",
        impressions: 900,
        position: 8,
      },
      source: {
        url: "https://example.com/article",
        statusCode: 200,
        capturedAt: "2026-10-13T12:00:00Z",
        links: [],
        locations: [
          {
            location: "paragraph 2",
            text: "Our coffee service helps small offices every day.",
          },
        ],
      },
    };
    const finding = detectInternalLink(input);
    expect(finding).toMatchObject({
      kind: "internal_link",
      evidence: {
        link: {
          anchor: "coffee service",
          sourceLocation: "paragraph 2",
          sourceUrl: "https://example.com/article",
          destinationUrl: "https://example.com/service",
        },
      },
    });
    expect(
      detectInternalLink({
        ...input,
        source: { ...input.source, links: ["https://example.com/service"] },
      }),
    ).toBeNull();
    expect(
      detectInternalLink({
        ...input,
        source: { ...input.source, links: undefined },
      }),
    ).toBeNull();
    expect(
      detectInternalLink({
        ...input,
        source: { ...input.source, statusCode: 503 },
      }),
    ).toBeNull();
    expect(
      detectInternalLink({
        ...input,
        source: { ...input.source, locations: [] },
      }),
    ).toBeNull();
  });
});
