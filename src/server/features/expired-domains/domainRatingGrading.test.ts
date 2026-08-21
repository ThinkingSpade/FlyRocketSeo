import { describe, expect, it } from "vitest";
import {
  DOMAIN_RATING_CONCURRENCY,
  MAX_DOMAIN_RATING_ATTEMPTS,
  MAX_DOMAIN_RATING_LOOKUPS,
  gradeHarvestedDomainRatings,
  type DomainRatingCandidate,
  type DomainRatingGradingDependencies,
} from "@/server/features/expired-domains/domainRatingGrading";

function candidates(count: number): DomainRatingCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    id: "row-" + index,
    domain: "newest-" + index + ".com",
    domainRatingAttempts: 0,
  }));
}

function dependencies(
  overrides: Partial<DomainRatingGradingDependencies> = {},
): DomainRatingGradingDependencies {
  return {
    listCandidates: () => Promise.resolve([]),
    countUngraded: () => Promise.resolve(0),
    claimAttempt: (candidate) => Promise.resolve(`claim:${candidate.id}`),
    resolveRating: () => Promise.resolve(10),
    completeAttempt: () => Promise.resolve(true),
    releaseAttempt: () => Promise.resolve(),
    logFailures: () => undefined,
    ...overrides,
  };
}

describe("gradeHarvestedDomainRatings", () => {
  it("grades at most the budget-derived eight newest candidates with three concurrent lookups", async () => {
    const queued = candidates(12);
    const stored: string[] = [];
    const started: string[] = [];
    let requestedLimit = 0;
    let active = 0;
    let maxActive = 0;

    const result = await gradeHarvestedDomainRatings(
      { projectId: null },
      dependencies({
        listCandidates: ({ limit }) => {
          requestedLimit = limit;
          return Promise.resolve(queued);
        },
        resolveRating: async (domain) => {
          started.push(domain);
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise<void>((resolve) => queueMicrotask(resolve));
          active -= 1;
          return 12;
        },
        completeAttempt: ({ id }) => {
          stored.push(id);
          return Promise.resolve(true);
        },
      }),
    );

    expect(requestedLimit).toBe(MAX_DOMAIN_RATING_LOOKUPS);
    expect(MAX_DOMAIN_RATING_LOOKUPS).toBe(8);
    expect(started).toEqual(
      queued.slice(0, MAX_DOMAIN_RATING_LOOKUPS).map((row) => row.domain),
    );
    expect(stored).toHaveLength(MAX_DOMAIN_RATING_LOOKUPS);
    expect(maxActive).toBe(DOMAIN_RATING_CONCURRENCY);
    expect(result).toEqual({
      attempted: MAX_DOMAIN_RATING_LOOKUPS,
      graded: MAX_DOMAIN_RATING_LOOKUPS,
      failed: 0,
      remaining: 0,
    });
  });

  it("never claims a row that has already used all three attempts", async () => {
    const claimed: string[] = [];
    const lookedUp: string[] = [];

    const result = await gradeHarvestedDomainRatings(
      { projectId: "project-1" },
      dependencies({
        listCandidates: () =>
          Promise.resolve([
            {
              id: "eligible",
              domain: "eligible.com",
              domainRatingAttempts: MAX_DOMAIN_RATING_ATTEMPTS - 1,
            },
            {
              id: "exhausted",
              domain: "exhausted.com",
              domainRatingAttempts: MAX_DOMAIN_RATING_ATTEMPTS,
            },
          ]),
        claimAttempt: (candidate) => {
          claimed.push(candidate.id);
          return Promise.resolve(`claim:${candidate.id}`);
        },
        resolveRating: (domain) => {
          lookedUp.push(domain);
          return Promise.resolve(0);
        },
      }),
    );

    expect(claimed).toEqual(["eligible"]);
    expect(lookedUp).toEqual(["eligible.com"]);
    expect(result).toEqual({
      attempted: 1,
      graded: 1,
      failed: 0,
      remaining: 0,
    });
  });

  it("leaves unknown ratings null and logs every batch failure once", async () => {
    const logged: string[] = [];
    const stored: Array<[string, number]> = [];
    const released: string[] = [];

    const result = await gradeHarvestedDomainRatings(
      { projectId: "project-1" },
      dependencies({
        listCandidates: () =>
          Promise.resolve([
            {
              id: "unknown",
              domain: "unknown.com",
              domainRatingAttempts: 0,
            },
            {
              id: "timeout",
              domain: "timeout.com",
              domainRatingAttempts: 0,
            },
            {
              id: "good",
              domain: "good.com",
              domainRatingAttempts: 0,
            },
          ]),
        resolveRating: (domain) => {
          if (domain === "unknown.com") return Promise.resolve(null);
          if (domain === "timeout.com")
            return Promise.reject(new Error("request timed out"));
          return Promise.resolve(27);
        },
        completeAttempt: ({ id, rating }) => {
          stored.push([id, rating]);
          return Promise.resolve(true);
        },
        releaseAttempt: ({ id }) => {
          released.push(id);
          return Promise.resolve();
        },
        logFailures: (line) => logged.push(line),
      }),
    );

    expect(stored).toEqual([["good", 27]]);
    expect(released).toEqual(["unknown", "timeout"]);
    expect(logged).toEqual([
      "expired-domains.domain-rating failures: unknown.com: unknown rating; timeout.com: request timed out",
    ]);
    expect(result).toEqual({
      attempted: 3,
      graded: 1,
      failed: 2,
      remaining: 0,
    });
  });

  it("does not spend a sixth query releasing after a completion claim is lost", async () => {
    const released: Array<{ id: string; claimId: string }> = [];
    const logged: string[] = [];

    const result = await gradeHarvestedDomainRatings(
      { projectId: "project-1" },
      dependencies({
        listCandidates: () => Promise.resolve(candidates(1)),
        claimAttempt: () => Promise.resolve("claim-winner"),
        completeAttempt: () => Promise.resolve(false),
        releaseAttempt: (input) => {
          released.push(input);
          return Promise.resolve();
        },
        logFailures: (line) => logged.push(line),
      }),
    );

    expect(released).toEqual([]);
    expect(logged).toEqual([
      "expired-domains.domain-rating failures: newest-0.com: grading claim expired before storage",
    ]);
    expect(result).toEqual({
      attempted: 1,
      graded: 0,
      failed: 1,
      remaining: 0,
    });
  });

  it("counts retryable rows only after failed claims have been released", async () => {
    const events: string[] = [];

    const result = await gradeHarvestedDomainRatings(
      { projectId: "project-1", domains: ["unknown.com"] },
      dependencies({
        listCandidates: () =>
          Promise.resolve([
            {
              id: "unknown",
              domain: "unknown.com",
              domainRatingAttempts: 0,
            },
          ]),
        resolveRating: () => Promise.resolve(null),
        releaseAttempt: () => {
          events.push("release");
          return Promise.resolve();
        },
        countUngraded: ({ domains }) => {
          events.push("count");
          expect(domains).toEqual(["unknown.com"]);
          return Promise.resolve(1);
        },
      }),
    );

    expect(events).toEqual(["release", "count"]);
    expect(result).toEqual({
      attempted: 1,
      graded: 0,
      failed: 1,
      remaining: 1,
    });
  });
});
