import { expect, test } from "@playwright/test";
import { diagnostics, serverFunctionName, signIn } from "./helpers";
import { PROJECT_A2, PROJECT_OPERATIONS } from "./data";
import { expectCapturedAt, readActualCsv } from "./export-assertions";

test("Site Audit reopens stored crawl, filters and sorts its real rows, and exports their CSV", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/audit?auditId=operation-audit`);
  await expect(page.getByRole("row", { name: /\/healthy/ })).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByPlaceholder("URL, title, meta").fill("guide");
  await expect(page.getByRole("row", { name: /\/healthy/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /\/guide/ })).toBeVisible();
  await page.getByPlaceholder("URL, title, meta").fill("does-not-exist");
  await expect(
    page.getByText("No pages match these filters.", { exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder("URL, title, meta").fill("");
  await page.getByRole("button", { name: "Sort by URL", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "CSV", exact: true }).click();
  const { csv } = await readActualCsv(await downloadPromise, "site-audit.csv");
  expect(csv).toContain("Capture Started At");
  expect(csv).toContain("Capture Completed At");
  expect(csv).toContain("FlyRocketSEO crawl");
  expect(csv).toContain("operation-audit");
  expect(csv).toContain("2026-09-29T11:50:00.000Z");
  expect(csv).toContain("2026-09-29T12:00:00.000Z");
  expect(csv).toContain("https://operation.example/guide");
  expect(csv).toContain("https://operation.example/healthy");
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("On-Page fixes generates from real stored crawl, persists approval, filters and resets across projects", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/on-page`);
  await page
    .getByRole("button", { name: /^(Generate fixes|Re-scan)$/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^All \(/ }).click();
  const approval = page
    .getByRole("button", { name: "Approve", exact: true })
    .first();
  if ((await approval.getAttribute("aria-pressed")) === "true") {
    await approval.click();
    await expect(approval).toHaveAttribute("aria-pressed", "false");
  }
  await approval.click();
  await page.getByRole("tab", { name: /^Approved \(/ }).click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("tab", { name: /^Approved \(/ }).click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/p/${PROJECT_A2}/on-page`);
  await expect(
    page.getByText("Run a site audit first", { exact: true }),
  ).toBeVisible();
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Search Performance filters, sorts and exports actual first-party service rows", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/search-performance`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await expect(
    page.getByRole("row", { name: /operation.example\/guide/ }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Device filter", exact: true })
    .selectOption("DESKTOP");
  await page
    .getByRole("combobox", { name: "Country filter", exact: true })
    .selectOption("usa");
  await page
    .getByRole("button", { name: "Sort by Clicks", exact: true })
    .click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Download CSV", exact: true })
    .click();
  const { csv, rows } = await readActualCsv(
    await downloadPromise,
    "search-performance.csv",
  );
  expect(csv).toContain("https://operation.example/guide");
  expect(csv).toContain("https://operation.example/healthy");
  expect(csv).toContain("Google Search Console");
  expect(csv).toContain("sc-domain:operation.example");
  expect(csv).toContain("Data State");
  expect(csv).toContain("Captured At");
  expect(csv).toContain("Rows Examined");
  expect(csv).toContain("Rows Exported");
  expect(csv).toContain("Truncated");
  expect(csv).toContain("Coverage");
  expect(csv).toContain('"usa","DESKTOP"');
  for (const exported of rows) {
    expect(exported).toMatchObject({
      Source: "Google Search Console",
      Property: "sc-domain:operation.example",
      Country: "usa",
      Device: "DESKTOP",
      "Search Type": "web",
      "Data State": "all",
      "Rows Examined": "2",
      "Rows Exported": "2",
      Truncated: "false",
    });
    expectCapturedAt(exported["Captured At"]);
  }
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Cannibalization retains query context into the real link investigation and checks source content", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/cannibalization`);
  await expect(
    page.getByText("operation rocket guide", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /internal links|link opportunities/i })
    .last()
    .click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/p/${PROJECT_OPERATIONS}/links`);
  expect(new URL(page.url()).searchParams.get("q")).toBe(
    "operation rocket guide",
  );
  await expect(
    page.getByText(/add link — mentions phrase/).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open this page", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Page Investigation", exact: true }),
  ).toBeVisible();
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Client Report reads independent real sources, retains authorship and prints the report with source gaps", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/report`);
  await expect(page.locator("#client-report")).toBeVisible();
  await page.getByPlaceholder("Your name").fill("Acceptance reviewer");
  await page.getByPlaceholder("Company name").fill("Local test agency");
  await expect(page.locator("#client-report")).toContainText(
    "Acceptance reviewer",
  );
  await page.reload();
  await expect(page.getByPlaceholder("Your name")).toHaveValue(
    "Acceptance reviewer",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#client-report")).toBeVisible();
  expect(
    await page
      .locator("#client-report")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  await page.pdf({
    path: "test-results/acceptance/operation-client-report.pdf",
    format: "A4",
    printBackground: true,
  });
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Expired Domains restores real R2 history, filters without spending, and preserves unknown availability", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (
      serverFunctionName(request.url())?.startsWith("runExpiredDomainSearch_")
    )
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/expired-domains`);
  const panel = page.getByTestId("expired-domains-panel");
  await expect(
    panel.getByText("operation-domain-1.example", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Unknown", { exact: true })).toBeVisible();
  await panel.getByPlaceholder(/Filter/).fill("operation-domain-1");
  await expect(
    panel.getByText("operation-domain-2.example", { exact: true }),
  ).toHaveCount(0);
  await panel.getByPlaceholder(/Filter/).fill("absent-domain");
  await expect(
    panel.getByText(/None of the 2 results match this filter/),
  ).toBeVisible();
  await page.reload();
  await expect(
    panel.getByText("operation-domain-1.example", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(0);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
