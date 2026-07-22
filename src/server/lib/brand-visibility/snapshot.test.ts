import { describe, it, expect } from "vitest";
import { snapshotFromResult } from "./snapshot";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

function baseResult(
  overrides: Partial<BrandLookupResult> = {},
): BrandLookupResult {
  return {
    query: "acme.com",
    detectedTargetType: "domain",
    resolvedTarget: "acme.com",
    fetchedAt: "2026-07-21T00:00:00.000Z",
    hasData: true,
    totalMentions: 120,
    totalAiSearchVolume: 3400,
    perPlatform: [
      {
        platform: "chat_gpt",
        status: "success",
        mentions: 80,
        aiSearchVolume: 2000,
      },
      {
        platform: "google",
        status: "success",
        mentions: 40,
        aiSearchVolume: 1400,
      },
    ],
    shareOfVoice: {
      platforms: ["chat_gpt", "google"],
      entries: [
        { label: "acme.com", isTarget: true, mentions: 120, sharePct: 40 },
        { label: "rival.com", isTarget: false, mentions: 180, sharePct: 60 },
      ],
    },
    topPages: [],
    topQueries: [],
    monthlyVolume: [],
    ...overrides,
  };
}

describe("snapshotFromResult", () => {
  it("extracts headline metrics and per-platform mentions", () => {
    const fields = snapshotFromResult(baseResult(), "2026-07-21");
    expect(fields.target).toBe("acme.com");
    expect(fields.capturedOn).toBe("2026-07-21");
    expect(fields.totalMentions).toBe(120);
    expect(fields.chatgptMentions).toBe(80);
    expect(fields.googleMentions).toBe(40);
    expect(fields.targetSharePct).toBe(40);
  });

  it("serializes the full result into resultJson", () => {
    const result = baseResult();
    const fields = snapshotFromResult(result, "2026-07-21");
    expect(JSON.parse(fields.resultJson)).toEqual(result);
  });

  it("uses null for a platform whose call errored or is absent", () => {
    const fields = snapshotFromResult(
      baseResult({
        perPlatform: [
          {
            platform: "chat_gpt",
            status: "error",
            mentions: null,
            aiSearchVolume: null,
          },
        ],
      }),
      "2026-07-21",
    );
    expect(fields.chatgptMentions).toBeNull();
    expect(fields.googleMentions).toBeNull();
  });

  it("caps stored topPages and topQueries so the row stays within DB limits", () => {
    const stored = JSON.parse(
      snapshotFromResult(
        baseResult({
          topPages: Array.from({ length: 40 }, (_, i) => ({
            url: `https://acme.com/${i}`,
            domain: "acme.com",
            platform: "chat_gpt" as const,
            mentions: i,
            capturedVolume: null,
            keywords: [],
          })),
          topQueries: Array.from({ length: 50 }, (_, i) => ({
            question: `q${i}`,
            platform: "chat_gpt" as const,
            aiSearchVolume: i,
            firstSeenAt: null,
            lastSeenAt: null,
            citedSources: [],
            brandsMentioned: [],
          })),
        }),
        "2026-07-21",
      ).resultJson,
    );
    expect(stored.topPages).toHaveLength(15);
    expect(stored.topQueries).toHaveLength(20);
  });

  it("has no share pct when share of voice is absent", () => {
    const fields = snapshotFromResult(
      baseResult({ shareOfVoice: null }),
      "2026-07-21",
    );
    expect(fields.targetSharePct).toBeNull();
  });
});
