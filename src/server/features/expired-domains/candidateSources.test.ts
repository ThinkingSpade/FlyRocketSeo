import { describe, expect, it, vi } from "vitest";
import {
  collectCandidates,
  createCompetitorsSource,
  createLinkGapSource,
  createSerpRivalsSource,
  type FinderContext,
} from "@/server/features/expired-domains/candidateSources";

const CONTEXT: FinderContext = {
  projectDomain: "deliotx.com",
  competitorDomains: ["rivala.com", "rivalb.com"],
  keywords: ["vending machines dallas", "micromarket"],
  locationCode: 2840,
  languageCode: "en",
};

/** One intersection item: keys map to CONTEXT.competitorDomains by index. */
function intersectionItem(
  referringDomain: string,
  competitorIndexes: number[],
): Record<string, unknown> {
  return {
    domain_intersection: Object.fromEntries(
      competitorIndexes.map((index) => [
        String(index + 1),
        { target: referringDomain, rank: 40, backlinks: 3 },
      ]),
    ),
  };
}

describe("createCompetitorsSource", () => {
  it("maps persisted competitors to candidates with no network call", async () => {
    const listCompetitors = vi
      .fn()
      .mockResolvedValue(["rivala.com", "rivalb.com"]);
    const source = createCompetitorsSource(listCompetitors);

    const candidates = await source.collect(CONTEXT);

    expect(source.metered).toBe(false);
    expect(candidates.map((candidate) => candidate.domain)).toEqual([
      "rivala.com",
      "rivalb.com",
    ]);
    expect(candidates[0]?.evidence.isKnownCompetitor).toBe(true);
    expect(candidates[0]?.sources).toEqual(["competitors"]);
  });
});

describe("createLinkGapSource", () => {
  it("records WHICH competitors each referring domain links to", async () => {
    const fetchIntersection = vi.fn().mockResolvedValue({
      data: {
        items: [
          intersectionItem("foodblog.com", [0, 1]),
          intersectionItem("nutritionhub.com", [1]),
        ],
        totalCount: 2,
      },
      billing: {},
    });
    const source = createLinkGapSource(fetchIntersection);

    const candidates = await source.collect(CONTEXT);

    expect(source.metered).toBe(true);
    const byDomain = new Map(
      candidates.map((candidate) => [candidate.domain, candidate]),
    );
    expect(byDomain.get("foodblog.com")?.evidence.linksToCompetitors).toEqual([
      "rivala.com",
      "rivalb.com",
    ]);
    expect(
      byDomain.get("nutritionhub.com")?.evidence.linksToCompetitors,
    ).toEqual(["rivalb.com"]);
  });

  it("excludes the project's own domain from the intersection request", async () => {
    let requested: { targets: string[]; excludeTargets?: string[] } | null =
      null;
    const fetchIntersection = vi.fn(
      (input: { targets: string[]; excludeTargets?: string[] }) => {
        requested = {
          targets: input.targets,
          excludeTargets: input.excludeTargets,
        };
        return Promise.resolve({
          data: { items: [], totalCount: 0 },
          billing: { path: ["test"], costUsd: 0 },
        });
      },
    );

    await createLinkGapSource(fetchIntersection).collect(CONTEXT);

    expect(requested).toEqual({
      targets: ["rivala.com", "rivalb.com"],
      excludeTargets: ["deliotx.com"],
    });
  });

  it("returns nothing rather than calling out when there are no competitors", async () => {
    const fetchIntersection = vi.fn();
    const candidates = await createLinkGapSource(fetchIntersection).collect({
      ...CONTEXT,
      competitorDomains: [],
    });

    expect(candidates).toEqual([]);
    expect(fetchIntersection).not.toHaveBeenCalled();
  });
});

describe("createSerpRivalsSource", () => {
  it("records which project keywords each rival ranks for", async () => {
    const fetchSerp = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            domain: "vendingnews.com",
            keywords_positions: { "vending machines dallas": [4] },
          },
          {
            domain: "deliotx.com",
            keywords_positions: { micromarket: [1] },
          },
        ],
        totalCount: 2,
      },
      billing: {},
    });
    const source = createSerpRivalsSource(fetchSerp);

    const candidates = await source.collect(CONTEXT);

    expect(source.metered).toBe(true);
    expect(candidates.map((candidate) => candidate.domain)).toContain(
      "vendingnews.com",
    );
    const rival = candidates.find(
      (candidate) => candidate.domain === "vendingnews.com",
    );
    expect(rival?.evidence.ranksForKeywords).toEqual([
      "vending machines dallas",
    ]);
  });

  it("returns nothing rather than calling out when there are no keywords", async () => {
    const fetchSerp = vi.fn();
    const candidates = await createSerpRivalsSource(fetchSerp).collect({
      ...CONTEXT,
      keywords: [],
    });

    expect(candidates).toEqual([]);
    expect(fetchSerp).not.toHaveBeenCalled();
  });
});

describe("collectCandidates", () => {
  it("records a failing source and still returns the others", async () => {
    const good = {
      name: "competitors",
      metered: false,
      collect: vi.fn().mockResolvedValue([
        {
          domain: "rivala.com",
          sources: ["competitors"],
          evidence: {
            linksToCompetitors: [],
            ranksForKeywords: [],
            isKnownCompetitor: true,
          },
        },
      ]),
    };
    const bad = {
      name: "link-gap",
      metered: true,
      collect: vi.fn().mockRejectedValue(new Error("BACKLINKS_BILLING_ISSUE")),
    };

    const result = await collectCandidates([good, bad], CONTEXT);

    expect(result.lists).toHaveLength(1);
    expect(result.sourcesUsed).toEqual(["competitors"]);
    expect(result.sourceErrors).toEqual([
      { source: "link-gap", code: "BACKLINKS_BILLING_ISSUE" },
    ]);
  });

  it("reports every source as used when all succeed", async () => {
    const source = (name: string) => ({
      name,
      metered: false,
      collect: vi.fn().mockResolvedValue([]),
    });

    const result = await collectCandidates(
      [source("competitors"), source("link-gap")],
      CONTEXT,
    );

    expect(result.sourcesUsed).toEqual(["competitors", "link-gap"]);
    expect(result.sourceErrors).toEqual([]);
  });
});
