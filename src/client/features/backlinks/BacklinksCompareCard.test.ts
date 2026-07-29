import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BacklinksCompareCard } from "./BacklinksCompareCard";
import {
  CompetingDomainsCard,
  LinkIntersectCard,
  ReferringNetworksCard,
} from "./BacklinksGapCards";
import type { BacklinksCompareResult } from "@/types/schemas/backlinks-compare";

/**
 * Render checks for the competitive cards. The point of most of them is that
 * they must show their controls *without* firing anything, so these assert the
 * pre-run state as carefully as the populated one.
 */

const noop = vi.fn();
const addStub = vi.fn(() => true);

const comparison: BacklinksCompareResult = {
  rows: [
    {
      target: "big-rival.com",
      isYou: false,
      rank: 71,
      backlinks: 12000,
      referringDomains: 2100,
      referringDomainsNofollow: 300,
      spamScore: 8,
      newReferringDomains: 40,
      lostReferringDomains: 10,
      netReferringDomains: 30,
    },
    {
      target: "deliotx.com",
      isYou: true,
      rank: 38,
      backlinks: 883,
      referringDomains: 310,
      referringDomainsNofollow: 62,
      spamScore: 14,
      newReferringDomains: 8,
      lostReferringDomains: 12,
      netReferringDomains: -4,
    },
  ],
  yourPosition: 2,
  totalTargets: 2,
  gapToLeader: 1790,
  leader: "big-rival.com",
  since: "2026-06-29",
  fetchedAt: "2026-07-29T00:00:00.000Z",
};

describe("BacklinksCompareCard", () => {
  it("offers the input with no competitors and does not claim a result", () => {
    const markup = renderToStaticMarkup(
      createElement(BacklinksCompareCard, {
        competitors: [],
        result: undefined,
        errorMessage: null,
        isLoading: false,
        hasCompared: false,
        canCompare: false,
        onAdd: addStub,
        onRemove: noop,
        onCompare: noop,
      }),
    );
    expect(markup).toContain("Compare against competitors");
    expect(markup).toContain("Add a competitor domain");
    expect(markup).toContain("competitor.com");
    expect(markup).not.toContain("Referring domains");
  });

  it("renders each competitor as a removable chip", () => {
    const markup = renderToStaticMarkup(
      createElement(BacklinksCompareCard, {
        competitors: ["rival-a.com", "rival-b.com"],
        result: undefined,
        errorMessage: null,
        isLoading: false,
        hasCompared: false,
        canCompare: true,
        onAdd: addStub,
        onRemove: noop,
        onCompare: noop,
      }),
    );
    expect(markup).toContain("rival-a.com");
    expect(markup).toContain("Remove rival-b.com");
  });

  it("renders the leaderboard, the verdict and the gap", () => {
    const markup = renderToStaticMarkup(
      createElement(BacklinksCompareCard, {
        competitors: ["big-rival.com"],
        result: comparison,
        errorMessage: null,
        isLoading: false,
        hasCompared: true,
        canCompare: true,
        onAdd: addStub,
        onRemove: noop,
        onCompare: noop,
      }),
    );
    expect(markup).toContain("#2 of 2");
    expect(markup).toContain("1,790");
    expect(markup).toContain("big-rival.com");
    expect(markup).toContain("2,100");
    // A losing net is signed so the direction is readable at a glance.
    expect(markup).toContain("-4");
    expect(markup).toContain("2026-06-29");
  });

  it("surfaces an error instead of a table", () => {
    const markup = renderToStaticMarkup(
      createElement(BacklinksCompareCard, {
        competitors: ["rival.com"],
        result: undefined,
        errorMessage: "Could not compare domains.",
        isLoading: false,
        hasCompared: true,
        canCompare: true,
        onAdd: addStub,
        onRemove: noop,
        onCompare: noop,
      }),
    );
    expect(markup).toContain("Could not compare domains.");
  });
});

describe("LinkIntersectCard", () => {
  it("shows how many competitors each domain already links to", () => {
    const markup = renderToStaticMarkup(
      createElement(LinkIntersectCard, {
        target: "deliotx.com",
        errorMessage: null,
        isLoading: false,
        onPageChange: noop,
        result: {
          rows: [
            {
              domain: "coffee-blog.com",
              competitorsLinked: 2,
              linkedTo: ["rival-a.com", "rival-b.com"],
              rank: 44,
              backlinks: 6,
              spamScore: 3,
              firstSeen: "2024-02-01",
            },
          ],
          totalCount: 1,
          hasMore: false,
          page: 1,
          competitors: ["rival-a.com", "rival-b.com"],
          fetchedAt: "2026-07-29T00:00:00.000Z",
        },
      }),
    );
    expect(markup).toContain("Link gap");
    expect(markup).toContain("coffee-blog.com");
    expect(markup).toContain("2 of 2");
    expect(markup).toContain("CSV");
  });

  it("says so plainly when there is no gap", () => {
    const markup = renderToStaticMarkup(
      createElement(LinkIntersectCard, {
        target: "deliotx.com",
        errorMessage: null,
        isLoading: false,
        onPageChange: noop,
        result: {
          rows: [],
          totalCount: 0,
          hasMore: false,
          page: 1,
          competitors: ["rival-a.com"],
          fetchedAt: "2026-07-29T00:00:00.000Z",
        },
      }),
    );
    expect(markup).toContain("No gap found");
    expect(markup).not.toContain("CSV");
  });
});

describe("CompetingDomainsCard", () => {
  it("waits behind its own button before running", () => {
    const markup = renderToStaticMarkup(
      createElement(CompetingDomainsCard, {
        result: undefined,
        errorMessage: null,
        isLoading: false,
        hasRun: false,
        competitors: [],
        onRun: noop,
        onAdd: addStub,
      }),
    );
    expect(markup).toContain("Find them");
    expect(markup).toContain("One lookup");
  });

  it("marks a domain already in the comparison as added", () => {
    const markup = renderToStaticMarkup(
      createElement(CompetingDomainsCard, {
        errorMessage: null,
        isLoading: false,
        hasRun: true,
        competitors: ["rival-a.com"],
        onRun: noop,
        onAdd: addStub,
        result: {
          rows: [
            { domain: "rival-a.com", rank: 60, intersections: 120 },
            { domain: "rival-b.com", rank: 40, intersections: 80 },
          ],
          fetchedAt: "2026-07-29T00:00:00.000Z",
        },
      }),
    );
    expect(markup).toContain("Added");
    expect(markup).toContain("Compare");
    expect(markup).toContain("120 shared");
  });
});

describe("ReferringNetworksCard", () => {
  it("calls out a concentrated profile", () => {
    const markup = renderToStaticMarkup(
      createElement(ReferringNetworksCard, {
        errorMessage: null,
        isLoading: false,
        hasRun: true,
        onRun: noop,
        result: {
          rows: [
            {
              networkAddress: "10.0.1.0/24",
              referringDomains: 40,
              backlinks: 90,
              rank: 20,
            },
            {
              networkAddress: "10.0.2.0/24",
              referringDomains: 30,
              backlinks: 60,
              rank: 20,
            },
            {
              networkAddress: "10.0.3.0/24",
              referringDomains: 20,
              backlinks: 40,
              rank: 20,
            },
            {
              networkAddress: "10.0.4.0/24",
              referringDomains: 10,
              backlinks: 10,
              rank: 20,
            },
          ],
          totalDomains: 100,
          topThreeShare: 0.9,
          fetchedAt: "2026-07-29T00:00:00.000Z",
        },
      }),
    );
    expect(markup).toContain("90%");
    expect(markup).toContain("footprint a link network leaves");
  });

  it("reads a well-spread profile as healthy", () => {
    const markup = renderToStaticMarkup(
      createElement(ReferringNetworksCard, {
        errorMessage: null,
        isLoading: false,
        hasRun: true,
        onRun: noop,
        result: {
          rows: [
            {
              networkAddress: "a",
              referringDomains: 10,
              backlinks: 10,
              rank: 20,
            },
            {
              networkAddress: "b",
              referringDomains: 10,
              backlinks: 10,
              rank: 20,
            },
            {
              networkAddress: "c",
              referringDomains: 10,
              backlinks: 10,
              rank: 20,
            },
            {
              networkAddress: "d",
              referringDomains: 10,
              backlinks: 10,
              rank: 20,
            },
            {
              networkAddress: "e",
              referringDomains: 60,
              backlinks: 10,
              rank: 20,
            },
          ],
          totalDomains: 100,
          topThreeShare: 0.2,
          fetchedAt: "2026-07-29T00:00:00.000Z",
        },
      }),
    );
    expect(markup).toContain("healthy spread");
  });
});
