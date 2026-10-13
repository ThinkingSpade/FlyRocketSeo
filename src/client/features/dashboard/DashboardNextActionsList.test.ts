import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Opportunity } from "@/client/features/opportunities/opportunityModel";
import { DashboardNextActionsList } from "./DashboardNextActionsList";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string;
    params: { projectId: string };
    search?: Record<string, string>;
    children: ReactNode;
  }) =>
    createElement(
      "a",
      {
        ...rest,
        href:
          to.replace("$projectId", params.projectId) +
          (search ? `?${new URLSearchParams(search)}` : ""),
      },
      children,
    ),
}));
const row: Opportunity = {
  kind: "quick-win",
  query: "office coffee",
  page: "https://example.com/coffee",
  position: 8.5,
  impressions: 200,
  clicksAtStake: 18,
};
const render = (rows: Opportunity[]) =>
  renderToStaticMarkup(
    createElement(DashboardNextActionsList, { projectId: "project-A", rows }),
  );
describe("dashboard evidence and handoff", () => {
  it("shows measured evidence without promoting a scenario to a traffic promise", () => {
    const html = render([row]);
    expect(html).toContain("office coffee");
    expect(html).toContain("200");
    expect(html).toContain("8.5");
    expect(html).not.toContain("monthly");
    expect(html).not.toContain("18 clicks");
  });
  it("carries the selected project and query into content investigation", () => {
    expect(render([row])).toContain("/p/project-A/content?q=office+coffee");
  });
  it("carries the affected URL into page investigation", () => {
    expect(render([row])).toContain(
      "/p/project-A/on-page?u=https%3A%2F%2Fexample.com%2Fcoffee",
    );
  });
  it("sends CTR reviews to the CTR tab with the original query", () => {
    expect(render([{ ...row, kind: "ctr" }])).toContain(
      "/p/project-A/search-performance?q=office+coffee&amp;tab=ctr",
    );
  });
  it("limits the overview to three actions without fabricating a total", () => {
    const html = render(
      Array.from({ length: 5 }, (_, i) => ({ ...row, query: `query ${i}` })),
    );
    expect(html.match(/<li\b/g)).toHaveLength(3);
    expect(html).not.toContain("query 3");
  });
});
