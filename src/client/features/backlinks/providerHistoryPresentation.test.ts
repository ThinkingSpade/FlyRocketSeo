import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BacklinksTimelineSection } from "./BacklinksTimelineSection";
import { DomainVisibilityTrend } from "../domain/components/DomainVisibilityTrend";

type Point = {
  date: string;
  referringDomains: number | null;
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
  newBacklinks: number | null;
  lostBacklinks: number | null;
  organicKeywords: number | null;
};
const fixture = vi.hoisted(() => ({
  query: {
    data: { points: [] as Point[], fetchedAt: "2026-10-12T12:00:00.000Z" },
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/serverFunctions/backlinks", () => ({
  getBacklinksTimeline: vi.fn(),
}));
vi.mock("@/serverFunctions/domain", () => ({ getDomainRankHistory: vi.fn() }));
vi.mock("@/client/lib/useMeteredQuery", () => ({
  useMeteredQuery: () => fixture.query,
  createMeteredRunKey: () => "fixture",
  useAuthorizedRun: () => ({
    authorized: true,
    runNonce: 0,
    authorize: vi.fn(),
  }),
}));
vi.mock("@/client/components/chart/echarts", () => ({ echarts: {} }));
vi.mock("@/client/components/chart/useChartTheme", () => ({
  useChartTheme: () => ({ text: "black", isDark: false }),
  useChartBase: () => ({ tooltip: {}, axisCommon: { axisLabel: {} } }),
}));
vi.mock("@cloudflare/kumo/components/chart", () => ({
  Chart: ({
    options,
  }: {
    options: {
      xAxis: { data: string[] };
      series: Array<{ data: Array<number | null>; connectNulls?: boolean }>;
      tooltip: { dangerousHtmlFormatter: (params: unknown) => string };
    };
  }) =>
    createElement("div", {
      "data-history-chart": true,
      "data-series": JSON.stringify(options.series),
      dangerouslySetInnerHTML: {
        __html: options.tooltip.dangerousHtmlFormatter({
          axisValue: options.xAxis.data.at(-1),
          value: options.series[0]?.data.at(-1),
        }),
      },
    }),
}));

function point(overrides: Partial<Point> = {}): Point {
  return {
    date: "2026-01-01",
    referringDomains: null,
    newReferringDomains: null,
    lostReferringDomains: null,
    newBacklinks: null,
    lostBacklinks: null,
    organicKeywords: null,
    ...overrides,
  };
}
function renderBacklinks() {
  return renderToStaticMarkup(
    createElement(BacklinksTimelineSection, {
      projectId: "project-1",
      target: "example.com",
      authorized: true,
      runNonce: 0,
    }),
  );
}
function renderDomain() {
  return renderToStaticMarkup(
    createElement(DomainVisibilityTrend, {
      projectId: "project-1",
      domain: "example.com",
      locationCode: 2840,
      languageCode: "en",
    }),
  );
}

beforeEach(() => {
  fixture.query.data.points = [];
  fixture.query.isError = false;
});

describe("provider history presentation", () => {
  it("does not describe missing backlink events as a zero-activity period", () => {
    fixture.query.data.points = [point(), point({ date: "2026-03-01" })];
    const markup = renderBacklinks();
    expect(markup).not.toContain(
      "No referring-domain gains or losses were recorded",
    );
    expect(markup).toContain("weren’t reported");
  });

  it("preserves unknown losses through signed bars and tooltip alongside known gains", () => {
    fixture.query.data.points = [
      point({ newReferringDomains: 2 }),
      point({ date: "2026-03-01", newReferringDomains: 3 }),
    ];
    const markup = renderBacklinks();
    expect(markup).toContain("+3 won");
    expect(markup).not.toContain("−null lost");
    expect(markup).not.toContain("−0 lost");
    expect(markup).toContain("Not reported");
    expect(markup).toContain("&quot;data&quot;:[null,null]");
    expect(markup).not.toContain("&quot;connectNulls&quot;:true");
  });

  it("identifies actual zero events without calling unknown events observed zeros", () => {
    fixture.query.data.points = [
      point({ newReferringDomains: 0, lostReferringDomains: 0 }),
      point({
        date: "2026-03-01",
        newReferringDomains: 0,
        lostReferringDomains: 0,
      }),
    ];
    expect(renderBacklinks()).toContain(
      "No referring-domain gains or losses were recorded",
    );
    fixture.query.data.points[1] = point({
      date: "2026-03-01",
      newReferringDomains: 0,
    });
    expect(renderBacklinks()).not.toContain(
      "No referring-domain gains or losses were recorded",
    );
  });

  it("retains a usable gains series when loss coverage is partial", () => {
    fixture.query.data.points = [
      point({ newReferringDomains: 2, lostReferringDomains: 0 }),
      point({ date: "2026-03-01", newReferringDomains: 3 }),
    ];
    const markup = renderBacklinks();
    expect(markup).toContain("data-history-chart");
    expect(markup).toContain("+3 won");
    expect(markup).toContain("Not reported");
  });

  it("does not show an all-null keyword history as a usable chart", () => {
    fixture.query.data.points = [
      point({ date: "2026-01" }),
      point({ date: "2026-03" }),
    ];
    const markup = renderDomain();
    expect(markup).not.toContain("data-history-chart");
    expect(markup).toContain("weren’t reported");
  });

  it("does not format a missing keyword observation as zero in a partial chart", () => {
    fixture.query.data.points = [
      point({ date: "2026-01", organicKeywords: 4 }),
      point({ date: "2026-03" }),
    ];
    const markup = renderDomain();
    expect(markup).toContain("data-history-chart");
    expect(markup).not.toContain("0 keywords");
    expect(markup).toContain("Not reported");
  });

  it("presents a failed domain request as an error with a retry action", () => {
    fixture.query.isError = true;
    const markup = renderDomain();
    expect(markup).toContain("could not be loaded");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("No historical visibility data available");
  });

  it("shows provider attribution and the original capture date for reused observations", () => {
    fixture.query.data.points = [
      point({
        newReferringDomains: 1,
        lostReferringDomains: 0,
        organicKeywords: 0,
      }),
      point({
        date: "2026-03-01",
        newReferringDomains: 2,
        lostReferringDomains: 0,
        organicKeywords: 0,
      }),
    ];
    expect(renderBacklinks()).toContain("DataForSEO");
    expect(renderBacklinks()).toContain("2026-10-12");
    expect(renderDomain()).toContain("DataForSEO");
    expect(renderDomain()).toContain("2026-10-12");
    expect(renderDomain()).toContain("0 keywords");
  });
});
