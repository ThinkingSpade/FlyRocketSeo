import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompetitorsPositioningMap } from "./CompetitorsPositioningMap";
import type { CompetitorRow } from "@/types/schemas/competitors";
const state = vi.hoisted(() => ({
  overview: {
    domain: "example.com",
    hasData: true,
    organicKeywords: 100,
    organicTraffic: 0.001,
    fetchedAt: "2026-10-01T12:00:00.000Z",
    scope: { locationCode: 2826, languageCode: "en", includeSubdomains: true },
  },
  options: null as {
    series: { data: { name: string }[] }[];
    tooltip: { dangerousHtmlFormatter: (value: unknown) => string };
  } | null,
}));
vi.mock("@/client/features/analysis-runs/useAutoRestoredRun", () => ({
  useAutoRestoredRun: () => ({
    restored: { result: state.overview },
    isError: false,
  }),
}));
vi.mock("@/client/components/chart/echarts", () => ({ echarts: {} }));
vi.mock("@/client/components/chart/useChartTheme", () => ({
  useChartTheme: () => ({ text: "black", isDark: false }),
  useChartBase: () => ({ tooltip: {}, axisCommon: {} }),
}));
vi.mock("@cloudflare/kumo/components/chart", () => ({
  Chart: (props: { options: typeof state.options }) => {
    state.options = props.options;
    return null;
  },
}));
const row: CompetitorRow = {
  domain: "rival.com",
  avgPosition: 3,
  intersections: 0,
  organicKeywords: 0,
  organicTraffic: 0,
  coverage: null,
  beatsYouCount: null,
  positionDelta: null,
  source: "domain",
  pinned: false,
  category: null,
};
const scope = {
  projectId: "p1",
  target: "example.com",
  locationCode: 2840,
  languageCode: "en",
  page: 1,
  pageSize: 25,
};
beforeEach(() => {
  state.options = null;
  state.overview.scope = {
    locationCode: 2826,
    languageCode: "en",
    includeSubdomains: true,
  };
});
describe("actual competitor chart consumer", () => {
  it("omits a restored target from a different national market", () => {
    renderToStaticMarkup(
      createElement(CompetitorsPositioningMap, {
        projectId: "p1",
        target: "example.com",
        rows: [row],
        discoveryMode: "domain",
        scope,
        fetchedAt: "2026-10-13T12:00:00.000Z",
      }),
    );
    expect(state.options).toBeNull();
  });
  it("renders matching captured scope with both original observation dates disclosed", () => {
    state.overview.scope.locationCode = 2840;
    const html = renderToStaticMarkup(
      createElement(CompetitorsPositioningMap, {
        projectId: "p1",
        target: "example.com",
        rows: [row],
        discoveryMode: "domain",
        scope,
        fetchedAt: "2026-10-13T12:00:00.000Z",
      }),
    );
    expect(state.options?.series[0].data.map((point) => point.name)).toEqual([
      "rival.com",
      "example.com (you)",
    ]);
    expect(
      state.options?.tooltip.dangerousHtmlFormatter({
        name: "example.com (you)",
      }),
    ).toContain("&lt;1 traffic");
    expect(html).toContain("2026-10-01T12:00:00.000Z");
    expect(html).toContain("2026-10-13T12:00:00.000Z");
  });
});
