import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import {
  BacklinksAuthorityChart,
  BacklinksNewLostChart,
} from "./BacklinksPageCharts";

const chart = vi.hoisted(() => ({ options: null as unknown }));
vi.mock("@/client/components/chart/echarts", () => ({ echarts: {} }));
vi.mock("@/client/components/chart/useChartTheme", () => ({
  useChartTheme: () => ({ text: "black", isDark: false }),
  useChartBase: () => ({ tooltip: {}, axisCommon: { axisLabel: {} } }),
}));
vi.mock("@cloudflare/kumo/components/chart", () => ({
  Chart: ({ options }: { options: unknown }) => {
    chart.options = options;
    return createElement("div", { "data-chart": true });
  },
}));
beforeEach(() => {
  chart.options = null;
});

it("keeps missing rank observations as chart gaps in saved overview history", () => {
  renderToStaticMarkup(
    createElement(BacklinksAuthorityChart, {
      data: [
        {
          date: "2026-01-01",
          backlinks: null,
          referringDomains: null,
          rank: 5,
        },
        {
          date: "2026-02-01",
          backlinks: null,
          referringDomains: null,
          rank: null,
        },
        {
          date: "2026-03-01",
          backlinks: null,
          referringDomains: null,
          rank: 8,
        },
      ],
    }),
  );
  expect(chart.options).toMatchObject({
    xAxis: { data: ["2026-01-01", "2026-02-01", "2026-03-01"] },
    series: [{ data: [5, null, 8], connectNulls: false }],
  });
});

it("does not call unknown event periods zero activity when the known months were quiet", () => {
  const html = renderToStaticMarkup(
    createElement(BacklinksNewLostChart, {
      data: [
        {
          date: "2026-01-01",
          newBacklinks: 0,
          lostBacklinks: 0,
          newReferringDomains: 0,
          lostReferringDomains: 0,
        },
        {
          date: "2026-02-01",
          newBacklinks: null,
          lostBacklinks: null,
          newReferringDomains: null,
          lostReferringDomains: null,
        },
        {
          date: "2026-03-01",
          newBacklinks: 0,
          lostBacklinks: 0,
          newReferringDomains: 0,
          lostReferringDomains: 0,
        },
      ],
    }),
  );
  expect(html).toContain("Some periods are unknown");
  expect(html).not.toContain(
    "No backlink gains or losses were recorded in this period",
  );
});
