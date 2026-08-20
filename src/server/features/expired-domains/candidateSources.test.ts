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

  // The guard lives in `unavailableReason`, not in `collect`, so the run can
  // TELL the user link gap did not search rather than silently counting it.
  it("declares itself unavailable when there are no competitors", () => {
    const source = createLinkGapSource(vi.fn());
    const reason = source.unavailableReason({
      ...CONTEXT,
      competitorDomains: [],
    });

    expect(reason).toMatch(/no competitors/i);
    // The message has to point at the fix, since this is the source that finds
    // adjacent sites and its absence is why a run looks thin.
    expect(reason).toMatch(/Competitors tab/i);
    expect(source.unavailableReason(CONTEXT)).toBeNull();
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

  it("declares itself unavailable when there are no keywords", () => {
    const source = createSerpRivalsSource(vi.fn());

    expect(source.unavailableReason({ ...CONTEXT, keywords: [] })).toMatch(
      /rank-tracked keywords/i,
    );
    expect(source.unavailableReason(CONTEXT)).toBeNull();
  });
});

describe("collectCandidates", () => {
  it("records a failing source and still returns the others", async () => {
    const good = {
      name: "competitors",
      metered: false,
      unavailableReason: () => null,
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
      unavailableReason: () => null,
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
      unavailableReason: () => null,
      collect: vi.fn().mockResolvedValue([]),
    });

    const result = await collectCandidates(
      [source("competitors"), source("link-gap")],
      CONTEXT,
    );

    expect(result.sourcesUsed).toEqual(["competitors", "link-gap"]);
    expect(result.sourceErrors).toEqual([]);
  });

  // The bug this pins: link gap returned [] on a project with no competitors,
  // was counted as "used", and the run reported coverage it never had.
  it("records an unavailable source as skipped, never as used", async () => {
    const skipped = {
      name: "link-gap",
      metered: true,
      unavailableReason: () => "no competitors saved",
      collect: vi.fn().mockResolvedValue([]),
    };

    const result = await collectCandidates([skipped], CONTEXT);

    expect(result.sourcesUsed).toEqual([]);
    expect(result.sourcesSkipped).toEqual([
      { source: "link-gap", reason: "no competitors saved" },
    ]);
    // And it must not have been called at all -- a skipped metered source that
    // still fires would be a billed no-op.
    expect(skipped.collect).not.toHaveBeenCalled();
  });
});
