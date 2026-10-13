import { expect, test } from "@playwright/test";
import { diagnostics, serverFunctionName, signIn } from "./helpers";
import { PROJECT_A } from "./data";

test("keyword trends navigation, reload and restored evidence never authorize a paid discovery", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let paidAttempts = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getKeywordDiscovery_"))
      paidAttempts += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_A}/trends`);
  await expect(
    page.getByRole("heading", { name: "Keywords to target", exact: true }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("button", { name: /Get ranking data|Try again/i }).last(),
  ).toBeVisible();
  expect(paidAttempts).toBe(0);
  await expect(
    page.getByRole("button", { name: /Get ranking data.*uses credits/i }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Get ranking data.*uses credits/i }),
  ).toBeVisible();
  expect(paidAttempts).toBe(0);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
