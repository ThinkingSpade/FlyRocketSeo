import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const chart = vi.hoisted(() => ({
  options: null as unknown,
  tooltip: null as null | ((params: unknown) => string),
}));
vi.mock("@/client/components/chart/echarts", () => ({ echarts: {} }));
vi.mock("@/client/components/chart/useChartTheme", () => ({
  useChartTheme: () => ({ isDark: false }),
  useChartBase: () => ({ tooltip: {}, axisCommon: { axisLabel: {} } }),
}));
vi.mock("@cloudflare/kumo/components/chart", () => ({
  Chart: ({
    options,
  }: {
    options: {
      tooltip: { dangerousHtmlFormatter: (params: unknown) => string };
    };
  }) => {
    chart.options = options;
    chart.tooltip = options.tooltip.dangerousHtmlFormatter;
    return createElement("div");
  },
}));
import { AreaTrendChart } from "./AreaTrendChart";
it("keeps monthly omissions as gaps and labels missing tooltip values unknown", () => {
  renderToStaticMarkup(
    createElement(AreaTrendChart, {
      trend: [
        { year: 2026, month: 1, searchVolume: 0 },
        { year: 2026, month: 3, searchVolume: null },
        { year: 2026, month: 4, searchVolume: 2 },
      ],
    }),
  );
  expect(chart.options).toMatchObject({
    xAxis: { data: ["Jan", "Feb", "Mar", "Apr"] },
    series: [{ data: [0, null, null, 2], connectNulls: false }],
  });
  expect(chart.tooltip?.({ axisValue: "Mar", value: null })).toContain(
    "Unknown",
  );
  expect(chart.tooltip?.({ axisValue: "Jan", value: 0 })).toContain(">0<");
});
