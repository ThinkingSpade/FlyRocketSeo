import { expect, test } from "@playwright/test";
import { diagnostics, serverFunctionName, signIn } from "./helpers";
import { PROJECT_A } from "./data";

test("a failed GBP connection read still permits the independent stored report posts read", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  let connectionFailures = 0;
  const postStatuses: number[] = [];
  const controlledFailures: string[] = [];
  page.on("response", (response) => {
    if (
      serverFunctionName(response.url())?.startsWith("listGbpScheduledPosts_")
    )
      postStatuses.push(response.status());
    if (
      serverFunctionName(response.url())?.startsWith("getGbpConnection_") &&
      response.status() === 503
    )
      controlledFailures.push(`503 ${new URL(response.url()).pathname}`);
  });
  await page.route("**/_serverFn/**", async (route) => {
    if (
      serverFunctionName(route.request().url())?.startsWith("getGbpConnection_")
    ) {
      connectionFailures += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Controlled connection transport failure",
        }),
      });
    } else await route.fallback();
  });
  await page.goto(`/p/${PROJECT_A}/report`);
  await expect(
    page.getByRole("heading", { name: "Client Report", exact: true }),
  ).toBeVisible();
  await expect.poll(() => connectionFailures).toBeGreaterThan(0);
  await expect.poll(() => postStatuses, { timeout: 20_000 }).toEqual([200]);
  await page.waitForLoadState("networkidle");
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual(controlledFailures);
});
