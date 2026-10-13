import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { VisibilityTrendChart } from "./VisibilityTrendChart";
import { RankTrackingScoreboard } from "./RankTrackingScoreboard";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
const captured = vi.hoisted(() => ({
  options: null as unknown,
  sparklines: [] as unknown[],
}));
vi.mock("@/client/components/Sparkline", () => ({
  Sparkline: ({ values }: { values: unknown }) => {
    captured.sparklines.push(values);
    return createElement("div");
  },
}));
vi.mock("@/client/components/chart/echarts", () => ({ echarts: {} }));
vi.mock("@/client/components/chart/useChartTheme", () => ({
  useChartTheme: () => ({ surface: "white", isDark: false }),
  useChartBase: () => ({ tooltip: {}, axisCommon: { axisLabel: {} } }),
}));
vi.mock("@cloudflare/kumo/components/chart", () => ({
  Chart: ({ options }: { options: unknown }) => {
    captured.options = options;
    return createElement("div");
  },
}));
const cell = (
  runId: string,
  checkedAt: string,
  trackingKeywordId: string,
  position: number | null,
) => ({
  runId,
  checkedAt: `${checkedAt}T12:00:00Z`,
  trackingKeywordId,
  position,
});
it("retains the unknown latest check in the actual chart and does not label an older value as current", () => {
  const cells = [
    cell("r1", "2026-10-01", "a", 1),
    cell("r1", "2026-10-01", "b", 1),
    cell("r2", "2026-10-02", "a", 1),
    cell("r2", "2026-10-02", "b", 1),
    cell("r3", "2026-10-03", "a", 10),
  ];
  const html = renderToStaticMarkup(
    createElement(VisibilityTrendChart, {
      cells,
      volumeByKeywordId: new Map([
        ["a", 100],
        ["b", 100],
      ]),
    }),
  );
  expect(captured.options).toMatchObject({
    xAxis: { data: ["Oct 1", "Oct 2", "Oct 3"] },
    series: [{ data: [100, 100, null], connectNulls: false }],
  });
  expect(html).toContain("Latest check: Unknown");
  expect(html).not.toContain("100% now");
});
it("does not connect an incomplete visibility run into the scoreboard's compact trend", () => {
  captured.sparklines = [];
  const observed = {
    position: 1,
    previousPosition: 1,
    rankingUrl: null,
    serpFeatures: [],
    availability: "observed" as const,
    comparisonAvailability: "observed" as const,
    checkedAt: "2026-10-01T12:00:00Z",
  };
  const rows: RankTrackingRow[] = [
    {
      trackingKeywordId: "a",
      keyword: "a",
      searchVolume: 100,
      keywordDifficulty: null,
      cpc: null,
      desktop: observed,
      mobile: observed,
    },
    {
      trackingKeywordId: "b",
      keyword: "b",
      searchVolume: 100,
      keywordDifficulty: null,
      cpc: null,
      desktop: { ...observed, position: null, availability: "unavailable" },
      mobile: observed,
    },
  ];
  renderToStaticMarkup(
    createElement(RankTrackingScoreboard, {
      rows,
      device: "desktop",
      cells: [
        cell("r1", "2026-10-01", "a", 1),
        cell("r1", "2026-10-01", "b", 1),
        cell("r2", "2026-10-02", "a", 1),
        cell("r2", "2026-10-02", "b", 1),
        cell("r3", "2026-10-03", "a", 10),
      ],
    }),
  );
  expect(captured.sparklines).toEqual([]);
});
