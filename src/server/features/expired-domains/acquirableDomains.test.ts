import { describe, expect, it, vi } from "vitest";
import {
  findAcquirableDomains,
  MAX_AVAILABILITY_CHECKS,
} from "@/server/features/expired-domains/acquirableDomains";

const CACHE = {
  get: () => Promise.resolve(null),
  put: () => Promise.resolve(),
};

const BASE = {
  keywords: ["vending machines dallas", "breakroom services"],
  profileText: "",
  adjacentTerms: ["snack", "nutrition"],
  exclude: ["deliotx.com"],
  cache: CACHE,
  limit: 20,
};

describe("findAcquirableDomains", () => {
  // The cost ordering the whole feature depends on: Wayback is free, so it
  // filters first and availability is only paid for on names that had a site.
  it("only pays for availability on names that were archived", async () => {
    const archived = vi.fn((domain: string) =>
      Promise.resolve(domain.startsWith("snack")),
    );
    const available = vi.fn().mockResolvedValue(true);

    const result = await findAcquirableDomains({
      ...BASE,
      hadArchivedSite: archived,
      resolveAvailability: available,
    });

    expect(archived.mock.calls.length).toBeGreaterThan(
      available.mock.calls.length,
    );
    for (const [domain] of available.mock.calls) {
      expect(String(domain).startsWith("snack")).toBe(true);
    }
    expect(result.rows.every((row) => row.domain.startsWith("snack"))).toBe(
      true,
    );
  });

  it("surfaces only domains that are both archived and available", async () => {
    const result = await findAcquirableDomains({
      ...BASE,
      hadArchivedSite: () => Promise.resolve(true),
      resolveAvailability: (domain: string) =>
        Promise.resolve(domain.startsWith("nutrition")),
    });

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.domain.startsWith("nutrition"))).toBe(
      true,
    );
  });

  // An unknown Wayback answer must not be treated as "never existed", which
  // would silently drop a real target.
  it("does not discard a name whose archive check was inconclusive", async () => {
    const available = vi.fn().mockResolvedValue(true);
    await findAcquirableDomains({
      ...BASE,
      hadArchivedSite: () => Promise.resolve(null),
      resolveAvailability: available,
    });

    expect(available).toHaveBeenCalled();
  });

  it("reports what it checked so an empty result is legible", async () => {
    const result = await findAcquirableDomains({
      ...BASE,
      hadArchivedSite: () => Promise.resolve(false),
      resolveAvailability: vi.fn(),
    });

    expect(result.rows).toEqual([]);
    expect(result.summary.generated).toBeGreaterThan(0);
    expect(result.summary.hadHistory).toBe(0);
    expect(result.summary.availabilityChecked).toBe(0);
  });

  it("spends nothing when there is no vocabulary to build from", async () => {
    const archived = vi.fn();
    const available = vi.fn();

    const result = await findAcquirableDomains({
      ...BASE,
      keywords: [],
      profileText: "",
      adjacentTerms: [],
      hadArchivedSite: archived,
      resolveAvailability: available,
    });

    expect(result.rows).toEqual([]);
    expect(archived).not.toHaveBeenCalled();
    expect(available).not.toHaveBeenCalled();
  });

  it("never suggests an excluded domain", async () => {
    const result = await findAcquirableDomains({
      ...BASE,
      exclude: ["snackvending.com"],
      hadArchivedSite: () => Promise.resolve(true),
      resolveAvailability: () => Promise.resolve(true),
    });

    expect(result.rows.map((row) => row.domain)).not.toContain(
      "snackvending.com",
    );
  });
});

describe("findAcquirableDomains spend guards", () => {
  // The hazard: archive.org rate-limits (observed 429 in practice). Every
  // archive check then returns null, and if inconclusive names fall through
  // freely, a run silently bills availability for the WHOLE generated set.
  it("caps billed availability checks when the archive service is down", async () => {
    const available = vi.fn().mockResolvedValue(false);

    const result = await findAcquirableDomains({
      ...BASE,
      limit: 60,
      hadArchivedSite: () => Promise.resolve(null),
      resolveAvailability: available,
    });

    expect(available.mock.calls.length).toBeLessThanOrEqual(
      MAX_AVAILABILITY_CHECKS,
    );
    expect(result.summary.archiveUnavailable).toBe(true);
  });

  it("spends the budget on confirmed history before inconclusive names", async () => {
    const checked: string[] = [];
    await findAcquirableDomains({
      ...BASE,
      limit: 60,
      // Only these two are confirmed; everything else is inconclusive.
      hadArchivedSite: (domain: string) =>
        Promise.resolve(domain.startsWith("snack") ? true : null),
      resolveAvailability: (domain: string) => {
        checked.push(domain);
        return Promise.resolve(false);
      },
    });

    const firstConfirmed = checked.findIndex((d) => d.startsWith("snack"));
    const firstInconclusive = checked.findIndex((d) => !d.startsWith("snack"));
    expect(firstConfirmed).toBeGreaterThanOrEqual(0);
    if (firstInconclusive >= 0) {
      expect(firstConfirmed).toBeLessThan(firstInconclusive);
    }
  });

  it("does not flag the archive as down when it answered", async () => {
    const result = await findAcquirableDomains({
      ...BASE,
      hadArchivedSite: () => Promise.resolve(false),
      resolveAvailability: vi.fn(),
    });
    expect(result.summary.archiveUnavailable).toBe(false);
  });
});
