import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  diagnostics,
  serverFunctionName,
  signIn,
  submitWithPendingCheck,
} from "./helpers";
import { PROJECT_OPERATIONS } from "./data";

test("Keyword Gap explicitly compares real adapter observations and exports unknown versus zero with original precision and scope", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getKeywordGapPage_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/competitors`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Keyword Gap", exact: true }).click();
  await page
    .getByPlaceholder("example.com", { exact: true })
    .fill("primary.com");
  await page
    .getByPlaceholder("competitor.com", { exact: true })
    .fill("competitor.com");
  expect(calls).toBe(0);
  await submitWithPendingCheck(
    page,
    "getKeywordGapPage_",
    page.getByRole("button", { name: "Analyze", exact: true }),
  );
  const unknown = page.getByRole("row", { name: /contract gap unknown/ });
  const zero = page.getByRole("row", { name: /contract gap zero/ });
  await expect(unknown).toBeVisible();
  await expect(unknown.getByRole("cell").nth(1)).toHaveText("—");
  await expect(unknown.getByRole("cell").nth(2)).toHaveText("—");
  await expect(zero.getByRole("cell").nth(1)).toHaveText("0");
  await expect(zero.getByRole("cell").nth(2)).toHaveText("0");
  await expect(
    page.getByText(/DataForSEO Labs.*Captured/).first(),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export comparison CSV", exact: true })
    .click();
  const csv = await readFile(await (await downloadPromise).path(), "utf8");
  expect(csv).toContain("contract gap unknown");
  expect(csv).toContain("contract gap zero");
  expect(csv).toContain("0.1234");
  expect(csv).toContain("DataForSEO Labs");
  expect(csv).toContain("primary.com");
  expect(csv).toContain("competitor.com");
  expect(calls).toBe(1);
  await page.reload();
  await expect(
    page.getByText("Press Analyze to run this keyword comparison.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(calls).toBe(1);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Link Gap explicitly loads real intersection observations and exports genuine zero without manufacturing a first-seen date", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getLinkGapPage_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/competitors`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Link Gap", exact: true }).click();
  await page
    .getByPlaceholder("example.com", { exact: true })
    .fill("primary.com");
  await page
    .getByPlaceholder("competitor.com", { exact: true })
    .fill("competitor.com");
  expect(calls).toBe(0);
  await submitWithPendingCheck(
    page,
    "getLinkGapPage_",
    page.getByRole("button", { name: "Analyze", exact: true }),
  );
  const row = page.getByRole("row", { name: /linker.example/ });
  await expect(row).toBeVisible();
  await expect(row.getByRole("cell").nth(1)).toHaveText("0");
  await expect(row.getByRole("cell").nth(2)).toHaveText("0");
  await expect(row.getByRole("cell").nth(4)).toHaveText("—");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export comparison CSV", exact: true })
    .click();
  const csv = await readFile(await (await downloadPromise).path(), "utf8");
  expect(csv).toContain("linker.example");
  expect(csv).toContain("DataForSEO Backlinks");
  expect(csv).toContain('"linker.example","0","0","0",""');
  expect(calls).toBe(1);
  await page.reload();
  await expect(
    page.getByText("Press Analyze to run this link comparison.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(calls).toBe(1);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
