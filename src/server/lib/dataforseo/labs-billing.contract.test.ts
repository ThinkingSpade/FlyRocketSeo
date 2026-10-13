import { beforeAll, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ spent: vi.fn() }));
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "fixture-key"),
  isHostedServerAuthMode: vi.fn(async () => true),
}));
vi.mock("@/server/billing/subscription", () => ({
  assertUsageCreditsAvailable: vi.fn(async () => ({ monthlyRemaining: 100 })),
  getOrCreateOrganizationCustomer: vi.fn(async () => ({
    id: "fixture-customer",
  })),
  trackUsageCreditSpend: state.spent,
}));
import { createDataforseoClient } from "./client";
import { DataforseoChargedTaskError } from "./envelope";
beforeAll(async () => {
  await import("./fetchers");
}, 30_000);
describe("Malformed Labs observation billing", () => {
  it("meters the actual rejected SDK task once and never replays its POST", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              cost: 0.012,
              path: [
                "v3",
                "dataforseo_labs",
                "google",
                "keyword_overview",
                "live",
              ],
              result: [{ location_code: 2826, items: [] }],
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    try {
      const client = createDataforseoClient({
        organizationId: "org",
        userId: "user",
        userEmail: "test@example.com",
      });
      await expect(
        client.labs.keywordOverview({
          keywords: ["seo"],
          locationCode: 2840,
          languageCode: "en",
          creditFeature: "keyword_research",
        }),
      ).rejects.toBeInstanceOf(DataforseoChargedTaskError);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(state.spent).toHaveBeenCalledOnce();
      expect(state.spent.mock.calls[0][0]).toMatchObject({
        customerId: "fixture-customer",
        creditFeature: "keyword_research",
        costUsd: 0.012,
        properties: { fromCache: false },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
