import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { brandLookupResultSchema } from "@/types/schemas/ai-search";
import { BrandLookupMentionTrendCard } from "./BrandLookupMentionTrendCard";
const captured = vi.hoisted(() => ({ options: null as unknown }));
vi.mock("@/client/components/chart/echarts", () => ({ echarts: {} }));
vi.mock("@/client/components/chart/useChartTheme", () => ({
  useChartTheme: () => ({ brand: "blue", isDark: false }),
  useChartBase: () => ({ tooltip: {}, axisCommon: {} }),
}));
vi.mock("@cloudflare/kumo/components/chart", () => ({
  Chart: ({ options }: { options: unknown }) => {
    captured.options = options;
    return createElement("div");
  },
}));
it("renders explicit unknown monthly observations as gaps in the actual chart options", () => {
  const result = brandLookupResultSchema.parse({
    query: "acme",
    detectedTargetType: "keyword",
    resolvedTarget: "acme",
    fetchedAt: "2026-10-01T00:00:00Z",
    contractVersion: 2,
    source: "DataForSEO AI Optimization",
    scope: { locationCode: 2840, languageCode: "en" },
    hasData: true,
    totalMentions: 0,
    totalAiSearchVolume: 0,
    perPlatform: [],
    shareOfVoice: null,
    topPages: [],
    topQueries: [],
    monthlyVolume: [
      { year: 2026, month: 8, volume: 4 },
      { year: 2026, month: 9, volume: null },
      { year: 2026, month: 10, volume: 0 },
    ],
  });
  renderToStaticMarkup(createElement(BrandLookupMentionTrendCard, { result }));
  expect(captured.options).toMatchObject({
    series: [{ data: [4, null, 0], connectNulls: false }],
  });
});
