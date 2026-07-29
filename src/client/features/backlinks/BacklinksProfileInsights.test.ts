import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AnchorHealthCard,
  DomainQualityCard,
  FollowSplitCard,
  ToxicLinksCard,
} from "./BacklinksProfileInsights";
import type { BacklinksOverviewResult } from "@/types/schemas/backlinks-results";

/**
 * Render checks for the derived cards. They exist because each card returns
 * null on missing data by design, and a silent null is indistinguishable from
 * a card that never rendered — these pin down which case is which.
 */

function summary(
  overrides: Partial<BacklinksOverviewResult["summary"]> = {},
): BacklinksOverviewResult["summary"] {
  return {
    rank: 38,
    backlinks: 883,
    referringPages: 648,
    referringDomains: 310,
    brokenBacklinks: 0,
    brokenPages: 20,
    backlinksSpamScore: 14,
    targetSpamScore: 0,
    newBacklinks: 12,
    lostBacklinks: 4,
    newReferringDomains: 8,
    lostReferringDomains: 2,
    referringCountries: [],
    referringLinkTypes: [],
    referringTlds: [],
    referringLinkAttributes: [],
    referringPlatformTypes: [],
    referringPlacements: [],
    referringDomainsNofollow: 62,
    referringPagesNofollow: null,
    ...overrides,
  };
}

function page<T>(rows: T[]) {
  return {
    rows,
    totalCount: rows.length,
    hasMore: false,
    page: 1,
    pageSize: 100,
    fetchedAt: "2026-07-29T00:00:00.000Z",
  };
}

describe("FollowSplitCard", () => {
  it("renders the dofollow count and the split note", () => {
    const markup = renderToStaticMarkup(
      createElement(FollowSplitCard, { summary: summary() }),
    );
    expect(markup).toContain("Dofollow vs nofollow");
    expect(markup).toContain("248");
    expect(markup).toContain("80%");
  });

  it("renders nothing when the nofollow count is missing", () => {
    const markup = renderToStaticMarkup(
      createElement(FollowSplitCard, {
        summary: summary({ referringDomainsNofollow: null }),
      }),
    );
    expect(markup).toBe("");
  });
});

describe("AnchorHealthCard", () => {
  const anchors = page([
    {
      anchor: "best coffee machine",
      backlinks: 90,
      referringDomains: 40,
      rank: 30,
      spamScore: 0,
      firstSeen: null,
    },
    {
      anchor: "deliotx",
      backlinks: 120,
      referringDomains: 60,
      rank: 40,
      spamScore: 0,
      firstSeen: null,
    },
  ]);

  it("renders the breakdown and the over-optimization warning", () => {
    const markup = renderToStaticMarkup(
      createElement(AnchorHealthCard, { anchors, target: "deliotx.com" }),
    );
    expect(markup).toContain("Anchor text health");
    expect(markup).toContain("Over-optimized");
    expect(markup).toContain("best coffee machine");
    expect(markup).toContain("Branded");
  });

  it("renders nothing before the anchors sub-tab has loaded", () => {
    const markup = renderToStaticMarkup(
      createElement(AnchorHealthCard, {
        anchors: undefined,
        target: "deliotx.com",
      }),
    );
    expect(markup).toBe("");
  });
});

describe("DomainQualityCard", () => {
  const referringDomains = page([
    {
      domain: "a.com",
      rank: 5,
      backlinks: 1,
      referringPages: 1,
      spamScore: 0,
      firstSeen: null,
      brokenBacklinks: 0,
      brokenPages: 0,
    },
    {
      domain: "b.com",
      rank: 55,
      backlinks: 1,
      referringPages: 1,
      spamScore: 0,
      firstSeen: null,
      brokenBacklinks: 0,
      brokenPages: 0,
    },
  ]);

  it("renders the DR buckets and the strong-domain count", () => {
    const markup = renderToStaticMarkup(
      createElement(DomainQualityCard, { referringDomains }),
    );
    expect(markup).toContain("Referring domain quality");
    expect(markup).toContain("DR 51-60");
    expect(markup).toContain("median DR");
  });

  it("renders nothing when no row carries a rank", () => {
    const markup = renderToStaticMarkup(
      createElement(DomainQualityCard, {
        referringDomains: page([
          {
            domain: "a.com",
            rank: null,
            backlinks: 1,
            referringPages: 1,
            spamScore: 0,
            firstSeen: null,
            brokenBacklinks: 0,
            brokenPages: 0,
          },
        ]),
      }),
    );
    expect(markup).toBe("");
  });
});

describe("ToxicLinksCard", () => {
  it("renders flagged domains and offers the disavow download", () => {
    const markup = renderToStaticMarkup(
      createElement(ToxicLinksCard, {
        target: "deliotx.com",
        referringDomains: page([
          {
            domain: "spam.example",
            rank: 3,
            backlinks: 40,
            referringPages: 40,
            spamScore: 92,
            firstSeen: null,
            brokenBacklinks: 0,
            brokenPages: 0,
          },
        ]),
      }),
    );
    expect(markup).toContain("Toxic links worth reviewing");
    expect(markup).toContain("spam.example");
    expect(markup).toContain("92");
    expect(markup).toContain("Disavow file");
    expect(markup).toContain("review every line before uploading");
  });

  it("renders nothing when no domain crosses the threshold", () => {
    const markup = renderToStaticMarkup(
      createElement(ToxicLinksCard, {
        target: "deliotx.com",
        referringDomains: page([
          {
            domain: "clean.example",
            rank: 50,
            backlinks: 4,
            referringPages: 4,
            spamScore: 2,
            firstSeen: null,
            brokenBacklinks: 0,
            brokenPages: 0,
          },
        ]),
      }),
    );
    expect(markup).toBe("");
  });
});
