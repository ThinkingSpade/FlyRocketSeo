import { describe, expect, it } from "vitest";
import { keywordDiscoveryResultSchema } from "./keyword-discovery";

describe("keywordDiscoveryResultSchema", () => {
  it("accepts a successful run", () => {
    const parsed = keywordDiscoveryResultSchema.safeParse({
      status: "ok",
      domain: "americavending.com",
      fetchedAt: "2026-08-10T00:00:00.000Z",
      keywords: [
        {
          keyword: "office coffee service dallas",
          position: 7,
          searchVolume: 320,
          traffic: 41.2,
          cpc: 6.5,
          url: "https://americavending.com/coffee",
          relativeUrl: "/coffee",
          keywordDifficulty: 34,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a recorded failure, which is what stops the billing loop", () => {
    const parsed = keywordDiscoveryResultSchema.safeParse({
      status: "failed",
      reason: "insufficient_credits",
      attemptedAt: "2026-08-10T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a payload with no status discriminant", () => {
    const parsed = keywordDiscoveryResultSchema.safeParse({ keywords: [] });
    expect(parsed.success).toBe(false);
  });
});
