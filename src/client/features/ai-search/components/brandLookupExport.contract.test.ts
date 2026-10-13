import { expect, it } from "vitest";
import { buildBrandLookupExport } from "./brandLookupExport";
import { brandLookupResultSchema } from "@/types/schemas/ai-search";
const base = {
  query: "Acme",
  resolvedTarget: "acme",
  detectedTargetType: "keyword" as const,
  fetchedAt: "2026-10-01T00:00:00Z",
  hasData: true,
  partialPlatforms: [],
  totalMentions: 10,
  totalAiSearchVolume: 20,
  perPlatform: [],
  shareOfVoice: {
    platforms: ["google" as const],
    entries: [{ label: "acme", isTarget: true, mentions: 10, sharePct: 100 }],
  },
  topPages: [],
  topQueries: [],
  monthlyVolume: [{ year: 2026, month: 10, volume: 0 }],
};
it("exports original source, capture and the platform-specific market beside observations", () => {
  const result = {
    ...base,
    contractVersion: 2 as const,
    source: "DataForSEO AI Optimization" as const,
    scope: { locationCode: 2826, languageCode: "fr" },
  };
  const table = buildBrandLookupExport(
    "queries",
    [],
    [
      {
        question: "q",
        platform: "chat_gpt",
        aiSearchVolume: null,
        firstSeenAt: null,
        lastSeenAt: null,
        citedSources: [],
        brandsMentioned: [],
      },
    ],
    result,
  );
  expect(table.headers).toEqual(
    expect.arrayContaining([
      "Source",
      "Captured at",
      "Target",
      "Location code",
      "Language code",
    ]),
  );
  expect(table.rows[0]).toEqual(
    expect.arrayContaining([
      "DataForSEO AI Optimization",
      "2026-10-01T00:00:00Z",
      "acme",
      2840,
      "en",
    ]),
  );
  expect(table.rows[0][2]).toBe("");
});
it("keeps legacy saved observations readable while suppressing uncertified derived totals, trends and shares", () => {
  const parsed = brandLookupResultSchema.parse(base);
  expect(parsed.fetchedAt).toBe(base.fetchedAt);
  expect(parsed.totalMentions).toBeNull();
  expect(parsed.totalAiSearchVolume).toBeNull();
  expect(parsed.monthlyVolume).toEqual([]);
  expect(parsed.shareOfVoice!.entries[0].sharePct).toBeNull();
});
