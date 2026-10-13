import { expect, test } from "@playwright/test";
import { expectCapturedAt, readActualCsv } from "./export-assertions";
import {
  diagnostics,
  serverFunctionName,
  signIn,
  submitWithPendingCheck,
} from "./helpers";
import { PROJECT_A2, PROJECT_OPERATIONS } from "./data";

test("Competitor discovery passes through the real adapter and its pin persists across free restored results", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getCompetitorsList_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/competitors`);
  await page.waitForLoadState("networkidle");
  await page
    .getByPlaceholder("example.com", { exact: true })
    .fill("primary.com");
  await submitWithPendingCheck(
    page,
    "getCompetitorsList_",
    page.getByRole("button", { name: "Analyze", exact: true }),
  );
  await expect(
    page.getByRole("row", { name: /competitor.com/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pin competitor.com", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unpin competitor.com", exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unpin competitor.com", exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page
    .getByRole("button", {
      name: "Exclude other-competitor.com",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("row", { name: /other-competitor.com/ }),
  ).toHaveCount(0);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Backlink exploration submits real summaries and rows, sorts, exports and filters without automatic renewal on reload", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let overviews = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getBacklinksOverview_"))
      overviews += 1;
  });
  await signIn(page);
  let releaseOverview!: () => void;
  const overviewReady = new Promise<void>((resolve) => {
    releaseOverview = resolve;
  });
  await page.route("**/_serverFn/**", async (route) => {
    if (
      serverFunctionName(route.request().url())?.startsWith(
        "getBacklinksOverview_",
      )
    )
      await overviewReady;
    await route.fallback();
  });
  await page.goto(`/p/${PROJECT_OPERATIONS}/backlinks`);
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Enter a domain or URL").fill("operation.com");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  try {
    await expect.poll(() => overviews).toBe(1);
    await expect(
      page.getByRole("button", { name: /^(Search|Loading\.\.\.)$/ }),
    ).toBeDisabled();
  } finally {
    releaseOverview();
  }
  const region = page.getByRole("region", {
    name: "Backlink table",
    exact: true,
  });
  await expect(
    region.getByRole("row", { name: /source-a.example/ }),
  ).toBeVisible();
  await region
    .getByRole("button", { name: /Sort by/ })
    .first()
    .click();
  await region
    .getByRole("button", { name: "Export backlinks table", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV", exact: true }).click();
  const { csv, rows } = await readActualCsv(
    await downloadPromise,
    "backlinks.csv",
  );
  for (const label of [
    "Source",
    "Captured At",
    "Target",
    "Scope",
    "Include Subdomains",
    "Export Page",
    "Page Size",
    "Total Count",
    "Has More",
  ])
    expect(csv).toContain(label);
  expect(csv).toContain("DataForSEO");
  expect(csv).toContain("operation.com");
  expect(csv).toContain("https://source-a.example/acceptance-source");
  expect(csv).toContain("https://operation.com/guide");
  for (const exported of rows) {
    expect(exported).toMatchObject({
      Source: "DataForSEO",
      Target: "operation.com",
      Scope: "domain",
      "Include Subdomains": "true",
    });
    expectCapturedAt(exported["Captured At"]);
  }
  for (const { tab, row, value } of [
    {
      tab: "Referring Domains",
      row: /source-a.example/,
      value: "source-a.example",
    },
    {
      tab: "Top Pages",
      row: /operation.com\/guide/,
      value: "https://operation.com/guide",
    },
    {
      tab: "Anchors",
      row: /operation rocket link/,
      value: "operation rocket link",
    },
  ]) {
    await region.getByRole("tab", { name: tab, exact: true }).click();
    await expect(region.getByRole("row", { name: row }).first()).toBeVisible();
    await region
      .getByRole("button", { name: "Export backlinks table", exact: true })
      .click();
    const tabDownloadPromise = page.waitForEvent("download");
    await page
      .getByRole("menuitem", { name: "Export CSV", exact: true })
      .click();
    const { csv: tabCsv, rows: tabRows } = await readActualCsv(
      await tabDownloadPromise,
      `${tab}.csv`,
    );
    expect(tabCsv).toContain(value);
    expect(tabCsv).toContain("Captured At");
    expect(tabCsv).toContain("operation.com");
    expect(tabCsv).toContain("DataForSEO");
    for (const exported of tabRows) {
      expect(exported).toMatchObject({
        Source: "DataForSEO",
        Target: "operation.com",
        Scope: "domain",
        "Include Subdomains": "true",
      });
      expectCapturedAt(exported["Captured At"]);
    }
  }
  await region.getByRole("tab", { name: "Backlinks", exact: true }).click();
  await region.getByRole("button", { name: /^Filters/ }).click();
  await region.getByPlaceholder("example.com, blog").fill("absent-fixture");
  await region.getByRole("button", { name: /^Apply/ }).click();
  await expect(
    region.getByRole("row", { name: /source-a.example/ }),
  ).toHaveCount(0);
  await expect(
    region
      .getByText(/No .*match|No backlinks/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  expect(overviews).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Backlinks", exact: true }),
  ).toBeVisible();
  expect(overviews).toBe(1);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
