import { describe, expect, it, vi } from "vitest";
import {
  CREDITS_PER_LOOKUP,
  estimateFinderCost,
  runExpiredDomainFinder,
} from "@/server/features/expired-domains/ExpiredDomainsService";
import type { CandidateSource } from "@/server/features/expired-domains/candidateSources";
import type { DomainExpiration } from "@/shared/domainExpiration";
import type { Candidate } from "@/shared/expiredDomains";

const NOW = Date.parse("2026-08-20T00:00:00Z");

const CONTEXT = {
  projectDomain: "deliotx.com",
  competitorDomains: ["rivala.com"],
  keywords: ["vending"],
  locationCode: 2840,
  languageCode: "en",
};

const CACHE = {
  get: () => Promise.resolve(null),
  put: () => Promise.resolve(),
};

function candidate(domain: string): Candidate {
  return {
    domain,
    sources: ["link-gap"],
    evidence: {
      linksToCompetitors: ["rivala.com"],
      ranksForKeywords: [],
      isKnownCompetitor: false,
    },
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

function sourceOf(name: string, candidates: Candidate[]): CandidateSource {
  return { name, metered: false, collect: () => Promise.resolve(candidates) };
}

describe("estimateFinderCost", () => {
  it("quotes five credits per candidate", () => {
    expect(estimateFinderCost(50)).toEqual({
      candidateCount: 50,
      expirationCredits: 50 * CREDITS_PER_LOOKUP,
    });
  });

  it("quotes nothing for an empty candidate set", () => {
    expect(estimateFinderCost(0).expirationCredits).toBe(0);
  });
});

describe("runExpiredDomainFinder", () => {
  // The cost saving the plan is built on: a live domain can never be
  // registered, so checking its availability is pure waste. Only the expired
  // subset is worth a second billed call.
  it("checks availability only for domains that came back expired", async () => {
    const candidates = [
      candidate("gone.com"),
      candidate("soon.com"),
      candidate("fine.com"),
    ];
    const resolveAvailability = vi.fn().mockResolvedValue(true);

    const result = await runExpiredDomainFinder({
      context: CONTEXT,
      sources: [sourceOf("link-gap", candidates)],
      cache: CACHE,
      cap: 50,
      exclusions: [],
      classify: () => null,
      nowMs: NOW,
      resolveExpirations: () =>
        Promise.resolve(
          new Map([
            ["gone.com", expiration("expired", -3)],
            ["soon.com", expiration("critical", 10)],
            ["fine.com", expiration("healthy", 900)],
          ]),
        ),
      resolveAvailability,
    });

    expect(resolveAvailability).toHaveBeenCalledTimes(1);
    expect(resolveAvailability).toHaveBeenCalledWith("gone.com", CACHE);
    expect(result.rows.map((row) => row.domain)).toEqual([
      "gone.com",
      "soon.com",
    ]);
    expect(result.rows[0]?.available).toBe(true);
    expect(result.rows[1]?.available).toBeNull();
  });

  it("looks up only the capped candidates, never the whole pool", async () => {
    const candidates = Array.from({ length: 10 }, (_, index) =>
      candidate(`d${index}.com`),
    );
    // Captured in the mock rather than read back off `mock.calls`, which
    // would need an `any` cast the lint rules rightly reject.
    let looked: string[] = [];
    const resolveExpirations = vi.fn((domains: string[]) => {
      looked = domains;
      return Promise.resolve(new Map());
    });

    await runExpiredDomainFinder({
      context: CONTEXT,
      sources: [sourceOf("link-gap", candidates)],
      cache: CACHE,
      cap: 3,
      exclusions: [],
      classify: () => null,
      nowMs: NOW,
      resolveExpirations,
      resolveAvailability: vi.fn(),
    });

    expect(looked).toHaveLength(3);
  });

  it("reports which sources answered and which failed", async () => {
    const failing: CandidateSource = {
      name: "link-gap",
      metered: true,
      collect: () => Promise.reject(new Error("BACKLINKS_BILLING_ISSUE")),
    };

    const result = await runExpiredDomainFinder({
      context: CONTEXT,
      sources: [sourceOf("competitors", [candidate("rivala.com")]), failing],
      cache: CACHE,
      cap: 50,
      exclusions: [],
      classify: () => null,
      nowMs: NOW,
      resolveExpirations: () =>
        Promise.resolve(new Map([["rivala.com", expiration("healthy", 500)]])),
      resolveAvailability: vi.fn(),
    });

    expect(result.sourcesUsed).toEqual(["competitors"]);
    expect(result.sourceErrors).toEqual([
      { source: "link-gap", code: "BACKLINKS_BILLING_ISSUE" },
    ]);
    // Healthy is not surfaced, but the summary must still say it was checked --
    // otherwise the empty state would claim coverage it never had.
    expect(result.summary.checked).toBe(1);
    expect(result.summary.surfaced).toBe(0);
  });

  it("spends nothing when every candidate is filtered out", async () => {
    const resolveExpirations = vi.fn().mockResolvedValue(new Map());

    const result = await runExpiredDomainFinder({
      context: CONTEXT,
      sources: [sourceOf("link-gap", [candidate("deliotx.com")])],
      cache: CACHE,
      cap: 50,
      exclusions: [],
      classify: () => null,
      nowMs: NOW,
      resolveExpirations,
      resolveAvailability: vi.fn(),
    });

    expect(resolveExpirations).not.toHaveBeenCalled();
    expect(result.rows).toEqual([]);
    expect(result.summary.checked).toBe(0);
  });

  it("does not let one availability failure drop the row", async () => {
    const result = await runExpiredDomainFinder({
      context: CONTEXT,
      sources: [sourceOf("link-gap", [candidate("gone.com")])],
      cache: CACHE,
      cap: 50,
      exclusions: [],
      classify: () => null,
      nowMs: NOW,
      resolveExpirations: () =>
        Promise.resolve(new Map([["gone.com", expiration("expired", -9)]])),
      resolveAvailability: () => Promise.reject(new Error("boom")),
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.available).toBeNull();
  });
});
