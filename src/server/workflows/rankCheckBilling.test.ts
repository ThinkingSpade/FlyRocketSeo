import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  estimateRankCheckCredits: vi.fn(),
  getUsageCreditsRemaining: vi.fn(),
}));

vi.mock("@/server/billing/subscription", () => ({
  getUsageCreditsRemaining: mocks.getUsageCreditsRemaining,
}));

vi.mock("@/shared/rank-tracking", () => ({
  estimateRankCheckCredits: mocks.estimateRankCheckCredits,
}));

import { assertRankCheckCreditsAvailable } from "./rankCheckBilling";

const input = {
  customerId: "org_123",
  keywordCount: 5,
  devices: "both" as const,
  serpDepth: 20,
  trigger: "scheduled" as const,
};

describe("assertRankCheckCreditsAvailable", () => {
  beforeEach(() => {
    mocks.estimateRankCheckCredits.mockReset().mockReturnValue({
      costUsd: 0.1,
      costCredits: 10,
    });
    mocks.getUsageCreditsRemaining.mockReset();
  });

  it("allows an unmetered billing balance through the subscription abstraction", async () => {
    mocks.getUsageCreditsRemaining.mockResolvedValue({
      monthlyRemaining: Number.MAX_SAFE_INTEGER,
      topupRemaining: 0,
    });

    await expect(
      assertRankCheckCreditsAvailable(input),
    ).resolves.toBeUndefined();

    expect(mocks.getUsageCreditsRemaining).toHaveBeenCalledWith("org_123");
    expect(mocks.estimateRankCheckCredits).toHaveBeenCalledWith(
      5,
      "both",
      20,
      "queued",
    );
  });

  it("preserves insufficient-credit enforcement for metered billing", async () => {
    mocks.getUsageCreditsRemaining.mockResolvedValue({
      monthlyRemaining: 6,
      topupRemaining: 3,
    });

    await expect(assertRankCheckCreditsAvailable(input)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
      message: "Insufficient credits for rank check",
    });
  });
});
