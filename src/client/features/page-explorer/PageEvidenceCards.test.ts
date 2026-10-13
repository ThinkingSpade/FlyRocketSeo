import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/serverFunctions/gsc", () => ({}));
import { PagePerformanceEvidence } from "./PageEvidenceCards";
import type { getPageInvestigationPerformance } from "@/serverFunctions/page-investigation";

type Report = Extract<
  Awaited<ReturnType<typeof getPageInvestigationPerformance>>,
  { connected: true }
>;
function report(): Report {
  return {
    connected: true,
    source: "Google Search Console",
    fetchedAt: "2026-10-13T12:00:00Z",
    scope: {
      projectId: "p",
      url: "https://example.com/page",
      searchType: "web",
      siteUrl: "sc-domain:example.com",
      connectedBy: "user",
    },
    range: {
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      prevStartDate: "2026-08-04",
      prevEndDate: "2026-08-31",
    },
    totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    prevTotals: { clicks: 30, impressions: 300, ctr: 0.1, position: 8 },
    queries: [],
    coverage: {
      currentRows: 0,
      previousRows: 1,
      currentTruncated: false,
      previousTruncated: false,
      queryRows: 0,
      queryTruncated: false,
      finalData: true,
    },
  };
}
function render(data: Report) {
  const client = new QueryClient();
  client.setQueryData(["evidence"], data);
  const query = new QueryObserver(client, {
    queryKey: ["evidence"],
    queryFn: async () => data,
  }).getCurrentResult();
  const html = renderToStaticMarkup(
    createElement(PagePerformanceEvidence, {
      performance: query,
      projectId: "p",
    }),
  );
  client.clear();
  return load(html);
}
function value($: ReturnType<typeof load>, label: string) {
  return $("p")
    .filter((_, element) => $(element).text() === label)
    .parent()
    .find("p")
    .eq(1)
    .text();
}
describe("page observation availability display", () => {
  it("shows an absent page period as unknown rather than observed zeros", () => {
    const $ = render(report());
    expect(value($, "Clicks")).toBe("Unknown");
    expect(value($, "Impressions")).toBe("Unknown");
    expect(value($, "Average position")).toBe("Unknown");
    expect($.text()).toContain("No current page observations");
    expect($.text()).toContain("Previous: 30");
  });
  it("preserves reported zero clicks with observed impressions and position", () => {
    const data = report();
    data.totals = { clicks: 0, impressions: 30, ctr: 0, position: 8 };
    data.coverage.currentRows = 1;
    const $ = render(data);
    expect(value($, "Clicks")).toBe("0");
    expect(value($, "Impressions")).toBe("30");
    expect(value($, "Average position")).toBe("8");
  });
  it("discloses partial daily pulls and never calls zero-impression position a rank", () => {
    const data = report();
    data.coverage.currentRows = 1;
    data.coverage.currentTruncated = true;
    const $ = render(data);
    expect(value($, "Average position")).toBe("Unknown");
    expect($.text()).toContain("Partial daily coverage");
  });
});
