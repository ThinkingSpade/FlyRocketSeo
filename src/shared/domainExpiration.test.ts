import { describe, expect, it } from "vitest";
import {
  deriveDomainExpiration,
  statusFromDaysToExpiration,
  type DomainExpirationFacts,
} from "@/shared/domainExpiration";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-08-20T00:00:00Z");

function factsExpiringInDays(days: number): DomainExpirationFacts {
  return {
    domain: "example.com",
    expirationDate: new Date(NOW + days * DAY_MS).toISOString(),
    createdDate: null,
    lastUpdatedDate: null,
  };
}

describe("statusFromDaysToExpiration", () => {
  it("returns null for an unknown day count rather than guessing healthy", () => {
    expect(statusFromDaysToExpiration(null)).toBeNull();
  });

  it("treats today and the past as expired", () => {
    expect(statusFromDaysToExpiration(0)).toBe("expired");
    expect(statusFromDaysToExpiration(-1)).toBe("expired");
  });

  it("uses inclusive upper bounds at each threshold", () => {
    expect(statusFromDaysToExpiration(1)).toBe("critical");
    expect(statusFromDaysToExpiration(30)).toBe("critical");
    expect(statusFromDaysToExpiration(31)).toBe("warning");
    expect(statusFromDaysToExpiration(90)).toBe("warning");
    expect(statusFromDaysToExpiration(91)).toBe("healthy");
  });
});

describe("deriveDomainExpiration", () => {
  it("derives day counts from the supplied clock", () => {
    const result = deriveDomainExpiration(factsExpiringInDays(45), NOW);
    expect(result.daysToExpiration).toBe(45);
    expect(result.status).toBe("warning");
  });

  it("reports fewer remaining days as the clock advances over identical facts", () => {
    const facts = factsExpiringInDays(10);
    const today = deriveDomainExpiration(facts, NOW);
    const inSevenDays = deriveDomainExpiration(facts, NOW + 7 * DAY_MS);
    expect(today.daysToExpiration).toBe(10);
    expect(inSevenDays.daysToExpiration).toBe(3);
    expect(inSevenDays.status).toBe("critical");
  });

  it("computes age from the creation date", () => {
    const result = deriveDomainExpiration(
      {
        domain: "example.com",
        expirationDate: null,
        createdDate: new Date(NOW - 3653 * DAY_MS).toISOString(),
        lastUpdatedDate: new Date(NOW - 40 * DAY_MS).toISOString(),
      },
      NOW,
    );
    expect(result.domainAgeDays).toBe(3653);
    expect(result.domainAgeYears).toBe(10);
    expect(result.daysSinceLastUpdate).toBe(40);
  });

  it("yields null — never zero — for absent or unparseable dates", () => {
    const result = deriveDomainExpiration(
      {
        domain: "example.com",
        expirationDate: "not-a-date",
        createdDate: null,
        lastUpdatedDate: null,
      },
      NOW,
    );
    expect(result.daysToExpiration).toBeNull();
    expect(result.domainAgeDays).toBeNull();
    expect(result.domainAgeYears).toBeNull();
    expect(result.daysSinceLastUpdate).toBeNull();
    expect(result.status).toBeNull();
  });
});
