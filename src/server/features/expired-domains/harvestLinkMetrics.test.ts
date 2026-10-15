import { describe, expect, it, vi } from "vitest";
import { collectLinkMetrics } from "@/server/features/expired-domains/harvestLinkMetrics";

const NOW = new Date("2026-10-15T05:30:00.000Z");

function deps(
  overrides: Partial<Parameters<typeof collectLinkMetrics>[1]> = {},
) {
  return {
    fetchBacklinks: vi.fn(() =>
      Promise.resolve([
        { target: "hunavending.com", backlinks: 412 },
        { target: "parcfermecoffee.com", backlinks: 0 },
      ]),
    ),
    fetchReferringDomains: vi.fn(() =>
      Promise.resolve([
        { target: "hunavending.com", referring_domains: 37 },
        { target: "parcfermecoffee.com", referring_domains: 0 },
      ]),
    ),
    fetchSpamScores: vi.fn(() =>
      Promise.resolve([{ target: "hunavending.com", spam_score: 12.6 }]),
    ),
    insert: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("collectLinkMetrics", () => {
  it("asks each bulk endpoint once for the whole batch", async () => {
    const d = deps();
    await collectLinkMetrics(
      {
        projectId: "p1",
        targets: [
          { id: "a", domain: "hunavending.com" },
          { id: "b", domain: "parcfermecoffee.com" },
        ],
        now: () => NOW,
      },
      d,
    );

    // The whole reason this is affordable: three request fees per batch, not
    // three per domain.
    expect(d.fetchBacklinks).toHaveBeenCalledOnce();
    expect(d.fetchReferringDomains).toHaveBeenCalledOnce();
    expect(d.fetchSpamScores).toHaveBeenCalledOnce();
    expect(d.fetchBacklinks).toHaveBeenCalledWith([
      "hunavending.com",
      "parcfermecoffee.com",
    ]);
  });

  it("correlates answers by target, keeps real zeros, and stores nulls for no answer", async () => {
    const d = deps();
    const result = await collectLinkMetrics(
      {
        projectId: "p1",
        // Response order deliberately differs from request order.
        targets: [
          { id: "b", domain: "parcfermecoffee.com" },
          { id: "a", domain: "hunavending.com" },
        ],
        now: () => NOW,
      },
      d,
    );

    expect(d.insert).toHaveBeenCalledWith([
      {
        harvestedDomainId: "b",
        projectId: "p1",
        backlinks: 0,
        referringDomains: 0,
        spamScore: null,
        checkedAt: NOW.toISOString(),
      },
      {
        harvestedDomainId: "a",
        projectId: "p1",
        backlinks: 412,
        referringDomains: 37,
        spamScore: 13,
        checkedAt: NOW.toISOString(),
      },
    ]);
    expect(result).toEqual({ checked: 2, withLinks: 1 });
  });

  it("writes nothing when any request fails, so the batch is retried rather than left blank", async () => {
    const d = deps({
      fetchSpamScores: vi.fn(() => Promise.reject(new Error("balance"))),
    });

    await expect(
      collectLinkMetrics(
        {
          projectId: "p1",
          targets: [{ id: "a", domain: "hunavending.com" }],
          now: () => NOW,
        },
        d,
      ),
    ).rejects.toThrow("balance");
    expect(d.insert).not.toHaveBeenCalled();
  });

  it("spends nothing on an empty batch", async () => {
    const d = deps();
    const result = await collectLinkMetrics(
      { projectId: "p1", targets: [], now: () => NOW },
      d,
    );
    expect(result).toEqual({ checked: 0, withLinks: 0 });
    expect(d.fetchBacklinks).not.toHaveBeenCalled();
  });
});
