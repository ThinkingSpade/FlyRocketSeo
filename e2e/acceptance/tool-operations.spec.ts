import { expect, test, type Page } from "@playwright/test";
import {
  diagnostics,
  signIn,
  serverFunctionName,
  submitWithPendingCheck,
} from "./helpers";
import { PROJECT_A2 } from "./data";
import { readFile } from "node:fs/promises";
import { captureTrendsNavigation } from "./trends-navigation-diagnostics";

const navigationCaptures = new WeakMap<
  Page,
  Awaited<ReturnType<typeof captureTrendsNavigation>>
>();
test.afterEach(async ({ page }, testInfo) => {
  const finish = navigationCaptures.get(page);
  if (!finish) return;
  await testInfo.attach("trends-submit-navigation", {
    body: Buffer.from(JSON.stringify(await finish(), null, 2)),
    contentType: "application/json",
  });
});

test.afterAll(async () =>
  expect(
    await readFile("test-results/acceptance-server.log", "utf8"),
  ).not.toContain("ACCEPTANCE_EXTERNAL_REQUEST_BLOCKED"),
);

test("SERP explicit analysis traverses the provider adapter and restores the durable run for free", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let analyses = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getSerpOverview_"))
      analyses += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/serp`);
  await page
    .getByPlaceholder("office coffee service dallas")
    .fill("operation rocket");
  expect(analyses).toBe(0);
  await submitWithPendingCheck(
    page,
    "getSerpOverview_",
    page.getByRole("button", { name: "Analyze", exact: true }),
  );
  await expect(
    page.getByRole("row", { name: /Acceptance rocket guide/ }),
  ).toBeVisible();
  expect(analyses).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("row", { name: /Acceptance rocket guide/ }),
  ).toBeVisible();
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  expect(analyses).toBe(1);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Trends comparison loads through the SDK, restores without spend, and reports a genuine empty response", async ({
  page,
}) => {
  navigationCaptures.set(page, await captureTrendsNavigation(page));
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getKeywordTrends_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/trends`);
  await page.waitForLoadState("networkidle");
  await page
    .getByPlaceholder("seo tools, keyword research, rank tracker")
    .fill("operation rocket");
  expect(calls).toBe(0);
  await submitWithPendingCheck(
    page,
    "getKeywordTrends_",
    page.getByRole("button", { name: "Compare", exact: true }),
  );
  await expect(
    page
      .getByText("operation rocket", { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Interest is relative to the peak/),
  ).toBeVisible();
  const observation = page.getByText(
    /DataForSEO Google Trends.*Worldwide.*Language en/,
  );
  await expect(observation).toContainText("Captured");
  const originalCapture = await observation.textContent();
  expect(calls).toBe(1);
  await page.reload();
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(observation).toHaveText(originalCapture ?? "");
  expect(calls).toBe(1);
  await page
    .getByPlaceholder("seo tools, keyword research, rank tracker")
    .fill("operation empty");
  const emptyResponse = page.waitForResponse(
    (response) =>
      serverFunctionName(response.url())?.startsWith("getKeywordTrends_") ===
      true,
  );
  await submitWithPendingCheck(
    page,
    "getKeywordTrends_",
    page.getByRole("button", { name: "Compare", exact: true }),
  );
  expect((await emptyResponse).ok()).toBe(true);
  await expect(
    page.getByText("No trend data available for these keywords.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toBe(2);
  await page.reload();
  await expect(
    page.getByText("No trend data available for these keywords.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  expect(calls).toBe(2);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Topic Clusters creates and restores real analysis storage while retaining its scoped keyword handoff", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getTopicClusters_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/clusters`);
  await page
    .getByPlaceholder("office vending machines")
    .fill("operation rocket");
  await submitWithPendingCheck(
    page,
    "getTopicClusters_",
    page.getByRole("button", { name: "Plan clusters", exact: true }),
  );
  await expect(
    page.getByText("operation rocket tools guide", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Unknown vol/).first()).toBeVisible();
  await expect(
    page.getByText("Unranked", { exact: true }).first(),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          Reflect.set(window, "acceptanceClusterMarkdown", value);
        },
      },
    });
  });
  await page.getByRole("button", { name: /Copy plan for AI/ }).click();
  const markdown = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, "acceptanceClusterMarkdown");
    return typeof value === "string" ? value : "";
  });
  expect(markdown).toContain("operation rocket");
  expect(markdown).toContain("DataForSEO Labs");
  expect(markdown).toContain("Unknown");
  expect(calls).toBe(1);
  await page.reload();
  await expect(
    page.getByText("operation rocket tools guide", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  expect(calls).toBe(1);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Page provider investigation inspects real scoped keyword and backlink adapters and restores without a new request", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getPageExplorer_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/page?pageView=research`);
  await page.waitForLoadState("networkidle");
  await page
    .getByPlaceholder("https://competitor.com/their-best-page/")
    .fill("https://primary.com/guide?edition=one");
  expect(calls).toBe(0);
  await submitWithPendingCheck(
    page,
    "getPageExplorer_",
    page.getByRole("button", { name: "Inspect", exact: true }),
  );
  await expect(
    page.getByRole("row", { name: /operation page keyword/ }).first(),
  ).toBeVisible();
  for (const label of ["Est. sample traffic", "Ranking keywords"]) {
    await expect(
      page.getByText(label, { exact: true }).locator("..").locator(".."),
    ).toContainText("Unknown");
  }
  const footer = page
    .getByText(/DataForSEO Labs and Backlinks.*location 2840/)
    .first();
  await expect(footer).toContainText("https://primary.com/guide?edition=one");
  await expect(footer).toContainText(
    "URL query parameters do not constrain Labs rows",
  );
  const originalCapture = await footer.textContent();
  expect(calls).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("row", { name: /operation page keyword/ }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  await expect(footer).toHaveText(originalCapture ?? "");
  expect(calls).toBe(1);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Content brief and separately authorized outlines use actual provider adapters, then restore without extra analysis", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let outlines = 0;
  page.on("request", (request) => {
    if (
      serverFunctionName(request.url())?.startsWith("analyzeContentCompetitor_")
    )
      outlines += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/serp`);
  await page
    .getByPlaceholder("office coffee service dallas")
    .fill("operation rocket");
  await submitWithPendingCheck(
    page,
    "getSerpOverview_",
    page.getByRole("button", { name: "Analyze", exact: true }),
  );
  const serpFooter = page.getByText(/fetched .*DataForSEO Google Organic SERP/);
  await expect(serpFooter).toBeVisible();
  const originalSerpDate = (await serpFooter.textContent())?.match(
    /fetched (.*?) · DataForSEO/,
  )?.[1];
  expect(originalSerpDate).toBeTruthy();
  await page.goto(`/p/${PROJECT_A2}/content`);
  await page
    .getByPlaceholder("office coffee service dallas")
    .fill("operation rocket");
  await submitWithPendingCheck(
    page,
    "getContentBrief_",
    page.getByRole("button", { name: /^Build brief/ }),
  );
  await expect(
    page.getByRole("heading", { name: /Terms to include/ }),
  ).toBeVisible();
  await expect(page.getByText(/^operation rocket guide/).first()).toBeVisible();
  const briefFooter = page.getByText(/Brief for .*SERP captured/);
  await expect(briefFooter).toContainText(`SERP captured ${originalSerpDate}`);
  const originalBriefCapture = await briefFooter.textContent();
  expect(outlines).toBe(0);
  await page
    .getByRole("button", { name: "Analyze competitor outlines", exact: true })
    .click();
  await expect(
    page.getByText("Preparing a rocket launch", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row", { name: /Acceptance rocket guide/ })
      .getByRole("cell")
      .nth(2),
  ).toHaveText("0");
  await expect(
    page
      .getByRole("row", { name: /Acceptance competitor guide/ })
      .getByRole("cell")
      .nth(2),
  ).toHaveText("—");
  await expect(
    page
      .getByRole("row", { name: /Acceptance rocket guide/ })
      .getByRole("cell")
      .nth(3),
  ).toHaveText("2");
  await expect(
    page
      .getByRole("row", { name: /Acceptance competitor guide/ })
      .getByRole("cell")
      .nth(3),
  ).toHaveText("—");
  await expect(
    page.getByText("Heading counts unavailable for 1 other page", {
      exact: true,
    }),
  ).toBeVisible();
  expect(outlines).toBe(2);
  await page.reload();
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Analyze competitor outlines",
      exact: true,
    }),
  ).toBeVisible();
  await expect(briefFooter).toHaveText(originalBriefCapture ?? "");
  expect(outlines).toBe(2);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("SERP provider failure is visible, a failed paid POST is not retried, and an empty response stays empty", async ({
  page,
}) => {
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getSerpOverview_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/serp`);
  await page
    .getByPlaceholder("office coffee service dallas")
    .fill("operation failure");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(
    page
      .getByText(
        /temporarily unavailable|HTTP 503|could not|unexpected error|Something went wrong/i,
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page
    .getByPlaceholder("office coffee service dallas")
    .fill("operation empty");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByText(/No organic results/i)).toBeVisible();
  expect(calls).toBe(2);
});
