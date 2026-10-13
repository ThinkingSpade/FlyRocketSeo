import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { diagnostics, signIn } from "./helpers";
import { OPERATION_RANK_CONFIG, PROJECT_OPERATIONS } from "./data";

test("Rank Tracking opens real scoped snapshots, filters unknown versus observed absence and exports their evidence", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(
    `/p/${PROJECT_OPERATIONS}/rank-tracking/${OPERATION_RANK_CONFIG}`,
  );
  const observed = page
    .getByRole("row", { name: /operation observed rocket/ })
    .first();
  const unchecked = page
    .getByRole("row", { name: /operation unchecked rocket/ })
    .first();
  await expect(observed).toContainText("8");
  await expect(unchecked).toContainText("Unknown");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV", exact: true }).click();
  const csv = await readFile(await (await downloadPromise).path(), "utf8");
  expect(csv).toContain("Desktop Status");
  expect(csv).toContain("Desktop Captured At");
  expect(csv).toContain("2026-09-29T12:00:00.000Z");
  expect(csv).toContain("DataForSEO Google Organic SERP");
  expect(csv).toContain("operation unchecked rocket");
  expect(csv).toContain("Unknown");
  expect(csv).toContain("Ranked");
  await page.getByTitle("Mobile", { exact: true }).click();
  await expect(observed).toContainText("Not found");
  await expect(unchecked).toContainText("Unknown");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const mobileDownloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV", exact: true }).click();
  const mobileCsv = await readFile(
    await (await mobileDownloadPromise).path(),
    "utf8",
  );
  expect(mobileCsv).toContain("Mobile Captured At");
  expect(mobileCsv).toContain("2026-09-29T12:00:00.000Z");
  expect(mobileCsv).toContain("Not found in checked depth");
  expect(mobileCsv).toContain("Unknown");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByPlaceholder("e.g. seo, tool").fill("unchecked");
  await expect(
    page.getByRole("row", { name: /operation observed rocket/ }),
  ).toHaveCount(0);
  await expect(unchecked).toBeVisible();
  await page.getByPlaceholder("e.g. seo, tool").fill("absent-fixture");
  await expect(
    page
      .getByText(/No keywords match|No matching/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("row", { name: /operation observed rocket/ }).first(),
  ).toBeVisible();
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
