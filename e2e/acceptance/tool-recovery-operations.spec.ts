import { expect, test } from "@playwright/test";
import { serverFunctionName, signIn } from "./helpers";
import { PROJECT_OPERATIONS } from "./data";

const recoveryCases = [
  {
    path: "audit?auditId=operation-audit",
    rpc: "getAuditStatus_",
    recovered: /Healthy operation page/,
  },
  {
    path: "rank-tracking",
    rpc: "getRankTrackingConfigSummaries_",
    recovered: /operation.example/,
  },
  {
    path: "saved",
    rpc: "getSavedKeywords_",
    recovered: /Saved Keywords/,
    error: /Saved keywords could not be loaded/,
  },
  {
    path: "search-performance",
    rpc: "getSearchPerformanceReport_",
    recovered: /Search Performance/,
  },
  {
    path: "links",
    rpc: "getLinkInsights_",
    recovered: /operation rocket guide/,
  },
  {
    path: "cannibalization",
    rpc: "getLinkInsights_",
    recovered: /operation rocket guide/,
  },
  {
    path: "on-page",
    rpc: "getOnPageFixes_",
    recovered: /On-Page Fixes/,
    error: /On-page fixes could not be loaded/,
  },
  {
    path: "expired-domains",
    rpc: "getHarvestedDomains_",
    recovered: /Dropped domains in your industry/,
  },
] as const;

for (const item of recoveryCases) {
  test(`${item.path.split("?")[0]} explicitly reports a failed free read and recovers from the actual service`, async ({
    page,
  }) => {
    let fail = true;
    let attempts = 0;
    await signIn(page);
    await page.route("**/_serverFn/**", (route) => {
      if (
        serverFunctionName(route.request().url())?.startsWith(item.rpc) &&
        fail
      ) {
        attempts += 1;
        return route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "Isolated acceptance transport failure",
        });
      }
      return route.continue();
    });
    await page.goto(`/p/${PROJECT_OPERATIONS}/${item.path}`);
    await expect(
      page
        .getByText(
          "error" in item
            ? item.error
            : /Isolated acceptance transport failure/,
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 45_000 });
    expect(attempts).toBeGreaterThan(0);
    expect(new URL(page.url()).pathname).toContain(`/p/${PROJECT_OPERATIONS}/`);
    fail = false;
    const retry = page
      .getByRole("button", { name: /^Retry$|Try again/i })
      .filter({ visible: true });
    if (await retry.count()) await retry.first().click();
    else await page.reload();
    await expect(
      page.getByText(item.recovered).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 45_000 });
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .getByText(/Isolated acceptance transport failure/)
        .filter({ visible: true }),
    ).toHaveCount(0);
  });
}
