import { describe, expect, it } from "vitest";
import {
  buildFinderRows,
  mergeCandidates,
  rankAndCap,
  scoreCandidate,
  type Candidate,
} from "@/shared/expiredDomains";
import type { DomainExpiration } from "@/shared/domainExpiration";

function candidate(over: Partial<Candidate> & { domain: string }): Candidate {
  return {
    sources: ["link-gap"],
    evidence: {
      linksToCompetitors: [],
      ranksForKeywords: [],
      isKnownCompetitor: false,
    },
    ...over,
  };
}

function expiration(
  status: DomainExpiration["status"],
  days: number | null,
): DomainExpiration {
  return {
    domain: "x.com",
    expirationDate: null,
    createdDate: null,
    lastUpdatedDate: null,
    daysToExpiration: days,
    domainAgeDays: null,
    domainAgeYears: null,
    daysSinceLastUpdate: null,
    status,
  };
}

const classifyNothing = () => null;

describe("mergeCandidates", () => {
  it("unions sources and evidence for one domain found under two spellings", () => {
    const merged = mergeCandidates([
      [
        candidate({
          domain: "blog.example.com",
          sources: ["link-gap"],
          evidence: {
            linksToCompetitors: ["rivala.com"],
            ranksForKeywords: [],
            isKnownCompetitor: false,
          },
        }),
      ],
      [
        candidate({
          domain: "example.com",
          sources: ["serp-rivals"],
          evidence: {
            linksToCompetitors: ["rivalb.com"],
            ranksForKeywords: ["vending machines"],
            isKnownCompetitor: true,
          },
        }),
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.domain).toBe("example.com");
    expect(merged[0]?.sources.toSorted()).toEqual(["link-gap", "serp-rivals"]);
    expect(merged[0]?.evidence.linksToCompetitors.toSorted()).toEqual([
      "rivala.com",
      "rivalb.com",
    ]);
    expect(merged[0]?.evidence.ranksForKeywords).toEqual(["vending machines"]);
    expect(merged[0]?.evidence.isKnownCompetitor).toBe(true);
  });

  it("drops entries whose domain cannot be normalized", () => {
    expect(mergeCandidates([[candidate({ domain: "not a domain" })]])).toEqual(
      [],
    );
  });

  it("does not double-count identical evidence from two sources", () => {
    const merged = mergeCandidates([
      [
        candidate({
          domain: "a.com",
          evidence: {
            linksToCompetitors: ["r1.com"],
            ranksForKeywords: [],
            isKnownCompetitor: false,
          },
        }),
      ],
      [
        candidate({
          domain: "a.com",
          sources: ["serp-rivals"],
          evidence: {
            linksToCompetitors: ["r1.com"],
            ranksForKeywords: [],
            isKnownCompetitor: false,
          },
        }),
      ],
    ]);

    expect(merged[0]?.evidence.linksToCompetitors).toEqual(["r1.com"]);
  });
});

describe("scoreCandidate", () => {
  it("ranks a competitor-linking domain above a merely-ranking one", () => {
    const links = candidate({
      domain: "a.com",
      evidence: {
        linksToCompetitors: ["r1.com", "r2.com"],
        ranksForKeywords: [],
        isKnownCompetitor: false,
      },
    });
    const ranks = candidate({
      domain: "b.com",
      evidence: {
        linksToCompetitors: [],
        ranksForKeywords: ["kw1", "kw2"],
        isKnownCompetitor: false,
      },
    });

    expect(scoreCandidate(links)).toBeGreaterThan(scoreCandidate(ranks));
  });

  it("rewards corroboration across sources", () => {
    const one = candidate({ domain: "a.com", sources: ["link-gap"] });
    const two = candidate({
      domain: "a.com",
      sources: ["link-gap", "serp-rivals"],
    });

    expect(scoreCandidate(two)).toBeGreaterThan(scoreCandidate(one));
  });

  it("scores a domain with no evidence at zero", () => {
    expect(scoreCandidate(candidate({ domain: "a.com" }))).toBe(0);
  });
});

describe("rankAndCap", () => {
  it("removes the project's own domain, including a subdomain spelling", () => {
    const rows = rankAndCap(
      [candidate({ domain: "mine.com" }), candidate({ domain: "other.com" })],
      {
        ownDomain: "www.mine.com",
        exclusions: [],
        cap: 10,
        classify: classifyNothing,
      },
    );

    expect(rows.map((row) => row.domain)).toEqual(["other.com"]);
  });

  it("removes platforms via the injected classifier", () => {
    const rows = rankAndCap(
      [
        candidate({ domain: "facebook.com" }),
        candidate({ domain: "real.com" }),
      ],
      {
        ownDomain: "mine.com",
        exclusions: [],
        cap: 10,
        classify: (domain) => (domain === "facebook.com" ? "social" : null),
      },
    );

    expect(rows.map((row) => row.domain)).toEqual(["real.com"]);
  });

  it("applies profile exclusions case-insensitively", () => {
    const rows = rankAndCap(
      [
        candidate({ domain: "vendingsupply.com" }),
        candidate({ domain: "keep.com" }),
      ],
      {
        ownDomain: "mine.com",
        exclusions: ["VENDINGSUPPLY"],
        cap: 10,
        classify: classifyNothing,
      },
    );

    expect(rows.map((row) => row.domain)).toEqual(["keep.com"]);
  });

  it("ignores blank exclusion tokens rather than excluding everything", () => {
    const rows = rankAndCap([candidate({ domain: "keep.com" })], {
      ownDomain: "mine.com",
      exclusions: ["", "   "],
      cap: 10,
      classify: classifyNothing,
    });

    expect(rows.map((row) => row.domain)).toEqual(["keep.com"]);
  });

  it("keeps the best-scoring candidates when capping", () => {
    const weak = candidate({ domain: "weak.com" });
    const strong = candidate({
      domain: "strong.com",
      evidence: {
        linksToCompetitors: ["r1.com", "r2.com", "r3.com"],
        ranksForKeywords: [],
        isKnownCompetitor: false,
      },
    });

    const rows = rankAndCap([weak, strong], {
      ownDomain: "mine.com",
      exclusions: [],
      cap: 1,
      classify: classifyNothing,
    });

    expect(rows.map((row) => row.domain)).toEqual(["strong.com"]);
  });
});

describe("buildFinderRows", () => {
  it("surfaces only expired, critical and warning, and counts the rest", () => {
    const candidates = [
      candidate({ domain: "gone.com" }),
      candidate({ domain: "soon.com" }),
      candidate({ domain: "fine.com" }),
      candidate({ domain: "unknown.com" }),
    ];
    const expirations = new Map<string, DomainExpiration | null>([
      ["gone.com", expiration("expired", -5)],
      ["soon.com", expiration("critical", 12)],
      ["fine.com", expiration("healthy", 900)],
      ["unknown.com", null],
    ]);

    const { rows, summary } = buildFinderRows(
      candidates,
      expirations,
      new Map(),
    );

    expect(rows.map((row) => row.domain)).toEqual(["gone.com", "soon.com"]);
    expect(summary.checked).toBe(4);
    expect(summary.surfaced).toBe(2);
    expect(summary.failed).toBe(1);
  });

  // A lookup that produced a null STATUS is unknown, not healthy. Counting it
  // as failed is what keeps the empty state honest.
  it("counts a resolved-but-statusless entry as failed, not healthy", () => {
    const { summary } = buildFinderRows(
      [candidate({ domain: "a.com" })],
      new Map([["a.com", expiration(null, null)]]),
      new Map(),
    );

    expect(summary.failed).toBe(1);
    expect(summary.surfaced).toBe(0);
  });

  it("sorts expired ahead of critical regardless of score", () => {
    const candidates = [
      candidate({
        domain: "soon.com",
        evidence: {
          linksToCompetitors: ["a.com", "b.com", "c.com"],
          ranksForKeywords: [],
          isKnownCompetitor: false,
        },
      }),
      candidate({ domain: "gone.com" }),
    ];
    const expirations = new Map<string, DomainExpiration | null>([
      ["soon.com", expiration("critical", 5)],
      ["gone.com", expiration("expired", -1)],
    ]);

    const { rows } = buildFinderRows(candidates, expirations, new Map());

    expect(rows.map((row) => row.domain)).toEqual(["gone.com", "soon.com"]);
  });

  it("carries availability through, leaving unknown as null", () => {
    const candidates = [candidate({ domain: "gone.com" })];
    const expirations = new Map<string, DomainExpiration | null>([
      ["gone.com", expiration("expired", -400)],
    ]);

    const known = buildFinderRows(
      candidates,
      expirations,
      new Map([["gone.com", true]]),
    );
    expect(known.rows[0]?.available).toBe(true);

    const unknown = buildFinderRows(candidates, expirations, new Map());
    expect(unknown.rows[0]?.available).toBeNull();
  });

  it("counts a candidate missing from the expiration map as failed", () => {
    const { summary } = buildFinderRows(
      [candidate({ domain: "ghost.com" })],
      new Map(),
      new Map(),
    );

    expect(summary.checked).toBe(1);
    expect(summary.failed).toBe(1);
  });
});
