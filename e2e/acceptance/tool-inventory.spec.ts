import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { diagnostics, signIn, serverFunctionName } from "./helpers";
import { PAGE_URL, PROJECT_A } from "./data";

const tools = [
  ["", "Primary acceptance"],
  ["keywords", "Keyword Research"],
  ["trends", "Keyword Trends"],
  ["serp", "SERP Overview"],
  ["content", "Content Optimizer"],
  ["page", "Page Investigation"],
  ["clusters", "Topic Clusters"],
  ["saved", "Saved Keywords"],
  ["rank-tracking", "Rank Tracking"],
  ["opportunities", "SEO Opportunities"],
  ["search-performance", "Search Performance"],
  ["links", "Link Opportunities"],
  ["cannibalization", "Cannibalization"],
  ["local-grid", "Local Rank Grid"],
  ["domain", "Domain Overview"],
  ["backlinks", "Backlinks"],
  ["expired-domains", "Expired Domains"],
  ["competitors", "Competitor Insights"],
  ["audit", "Site Audit"],
  ["on-page", "On-Page Fixes"],
  ["report", "Client Report"],
  ["brand-lookup", "AI Visibility"],
  ["prompt-explorer", "Prompt Explorer"],
  ["local", "Local SEO"],
] as const;

test.afterAll(async () =>
  expect(
    await readFile("test-results/acceptance-server.log", "utf8"),
  ).not.toContain("ACCEPTANCE_EXTERNAL_REQUEST_BLOCKED"),
);

for (const [path, heading] of tools) {
  test(`authenticated ${path || "overview"} landing renders its real page`, async ({
    page,
  }, testInfo) => {
    const captured = diagnostics(page);
    const scheduledPostsResponse =
      path === "report"
        ? page.waitForResponse(
            (response) =>
              serverFunctionName(response.url())?.startsWith(
                "listGbpScheduledPosts_",
              ) === true,
          )
        : null;
    await signIn(page);
    await page.goto(`/p/${PROJECT_A}${path ? `/${path}` : ""}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
    if (scheduledPostsResponse)
      expect((await scheduledPostsResponse).ok()).toBe(true);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("dialog", { name: "One quick setup step" }),
    ).toHaveCount(0);
    expect(captured.errors).toEqual([]);
    expect(captured.externalRequests).toEqual([]);
    expect(captured.failedServerResponses).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${path || "overview"}-desktop.png`),
      fullPage: true,
    });
    await testInfo.attach("runtime-diagnostics", {
      body: JSON.stringify(captured),
      contentType: "application/json",
    });
  });
}

for (const path of ["", "page", "opportunities"]) {
  test(`mobile ${path || "overview"} remains navigable without overflow`, async ({
    page,
  }, testInfo) => {
    const captured = diagnostics(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto(
      `/p/${PROJECT_A}${path ? `/${path}` : ""}${path === "page" ? `?u=${encodeURIComponent(PAGE_URL)}&startDate=2026-09-02&endDate=2026-09-29` : ""}`,
    );
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    if (path === "page") {
      await expect(
        page.getByRole("heading", {
          name: "Observed performance",
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page
            .getByRole("heading", { level: 1 })
            .first()
            .evaluate(
              (element) => getComputedStyle(element.parentElement!).opacity,
            ),
        )
        .toBe("1");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${path || "overview"}-mobile-content.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Toggle sidebar", exact: true })
      .click();
    await expect(
      page
        .getByRole("link", { name: "Page Investigation", exact: true })
        .first(),
    ).toBeVisible();
    expect(captured.errors).toEqual([]);
    expect(captured.externalRequests).toEqual([]);
    expect(captured.failedServerResponses).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${path || "overview"}-mobile.png`),
      fullPage: true,
    });
  });
}
