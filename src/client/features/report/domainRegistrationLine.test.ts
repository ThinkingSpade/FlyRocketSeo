import { describe, expect, it } from "vitest";
import { buildDomainRegistrationLine } from "@/client/features/report/domainRegistrationLine";

const NOW = Date.parse("2026-08-20T00:00:00Z");
const DAY_MS = 86_400_000;

function factsJson(expiresInDays: number, createdDaysAgo = 3653): string {
  return JSON.stringify({
    domain: "example.com",
    expirationDate: new Date(NOW + expiresInDays * DAY_MS).toISOString(),
    createdDate: new Date(NOW - createdDaysAgo * DAY_MS).toISOString(),
    lastUpdatedDate: null,
  });
}

describe("buildDomainRegistrationLine", () => {
  it("says nothing when the lookup was never run", () => {
    expect(buildDomainRegistrationLine(null, NOW)).toBeNull();
  });

  it("says nothing rather than guessing when the stored value is unusable", () => {
    expect(buildDomainRegistrationLine("{ not json", NOW)).toBeNull();
    expect(buildDomainRegistrationLine("{}", NOW)).toBeNull();
  });

  it("states age and remaining time for a healthy domain", () => {
    const line = buildDomainRegistrationLine(factsJson(551), NOW);
    expect(line).toContain("10 years old");
    expect(line).toContain("551 days");
  });

  // A report is a client deliverable: an imminent lapse is the one case that
  // has to read as urgent rather than as another neutral statistic.
  it("flags an imminent lapse", () => {
    const line = buildDomainRegistrationLine(factsJson(12), NOW);
    expect(line).toMatch(/renew/i);
  });

  it("flags an already-lapsed domain", () => {
    const line = buildDomainRegistrationLine(factsJson(-3), NOW);
    expect(line).toMatch(/expired/i);
  });

  // The stored dates are absolute, so the same row must read differently as
  // time passes -- that is the whole reason day counts are not stored.
  it("recomputes against the reader's clock, not the audit date", () => {
    const facts = factsJson(40);
    expect(buildDomainRegistrationLine(facts, NOW)).toContain("40 days");
    expect(buildDomainRegistrationLine(facts, NOW + 30 * DAY_MS)).toContain(
      "10 days",
    );
  });
});
