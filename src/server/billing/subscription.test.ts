import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTUMN_PAID_PLAN_FEATURE_ID } from "@/shared/billing";

const {
  captureServerEventMock,
  checkMock,
  getOrCreateMock,
  isBillingEnabledMock,
  trackMock,
} = vi.hoisted(() => ({
  captureServerEventMock: vi.fn(),
  checkMock: vi.fn(),
  getOrCreateMock: vi.fn(),
  isBillingEnabledMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    check: checkMock,
    customers: {
      getOrCreate: getOrCreateMock,
    },
    track: trackMock,
  },
  AUTUMN_TRACK_RETRY_OPTIONS: {},
}));

vi.mock("@/server/billing/config", () => ({
  isBillingEnabled: isBillingEnabledMock,
}));

// subscription.ts now imports posthog (for trackUsageCreditSpend); stub it so
// the test doesn't pull in the cloudflare:workers runtime it depends on.
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: captureServerEventMock,
}));

import {
  assertUsageCreditsAvailable,
  customerHasManagedAccess,
  customerHasPaidPlan,
  getUsageCreditsRemaining,
  getOrCreateOrganizationCustomer,
  trackUsageCreditSpend,
} from "./subscription";

describe("subscription billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isBillingEnabledMock.mockResolvedValue(true);
  });

  it("checks the paid plan entitlement", async () => {
    checkMock.mockResolvedValue({ allowed: true });

    await expect(customerHasPaidPlan("org_123")).resolves.toBe(true);

    expect(checkMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: AUTUMN_PAID_PLAN_FEATURE_ID,
    });
  });

  it("returns false when org lacks paid plan", async () => {
    checkMock.mockResolvedValue({ allowed: false });

    await expect(customerHasPaidPlan("org_123")).resolves.toBe(false);
  });

  it("looks up the billing customer by organization id", async () => {
    getOrCreateMock.mockResolvedValue({ id: "cust_123" });

    await getOrCreateOrganizationCustomer({
      organizationId: "org_123",
      userId: "user_123",
      userEmail: "alice@example.com",
    });

    expect(getOrCreateMock).toHaveBeenCalledWith({
      customerId: "org_123",
      email: "alice@example.com",
    });
  });

  describe("billing disabled", () => {
    beforeEach(() => {
      isBillingEnabledMock.mockResolvedValue(false);
    });

    it("allows paid-plan and managed access without Autumn checks", async () => {
      await expect(customerHasPaidPlan("org_123")).resolves.toBe(true);
      await expect(customerHasManagedAccess("org_123")).resolves.toBe(true);

      expect(checkMock).not.toHaveBeenCalled();
    });

    it("returns an unmetered usage balance without Autumn checks", async () => {
      await expect(getUsageCreditsRemaining("org_123")).resolves.toEqual({
        monthlyRemaining: Number.MAX_SAFE_INTEGER,
        topupRemaining: 0,
      });
      await expect(assertUsageCreditsAvailable("org_123")).resolves.toEqual({
        monthlyRemaining: Number.MAX_SAFE_INTEGER,
      });

      expect(checkMock).not.toHaveBeenCalled();
    });

    it("creates a synthetic customer and skips all spend side effects", async () => {
      const customer = {
        organizationId: "org_123",
        userId: "user_123",
        userEmail: "alice@example.com",
      };

      await expect(getOrCreateOrganizationCustomer(customer)).resolves.toEqual({
        id: "org_123",
      });
      await trackUsageCreditSpend({
        customer,
        customerId: "org_123",
        creditFeature: "backlinks",
        costUsd: 0.05,
        monthlyRemaining: Number.MAX_SAFE_INTEGER,
      });

      expect(checkMock).not.toHaveBeenCalled();
      expect(getOrCreateMock).not.toHaveBeenCalled();
      expect(trackMock).not.toHaveBeenCalled();
      expect(captureServerEventMock).not.toHaveBeenCalled();
    });
  });
});
