import { expect, test } from "@playwright/test";
import { diagnostics, serverFunctionName, signIn } from "./helpers";
import { PROJECT_A2 } from "./data";

function paidRequests(page: Parameters<typeof diagnostics>[0]) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const name = serverFunctionName(request.url());
    if (name?.startsWith("getDomain") || name?.startsWith("getBacklinks"))
      requests.push(name);
  });
  return requests;
}

test("restored domain observations retain unknown ranking buckets, genuine zero and original market without a paid run", async ({
  page,
}) => {
  const captured = diagnostics(page);
  const paid = paidRequests(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/domain`);
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  const distribution = page
    .locator("div.rounded-xl")
    .filter({ has: page.getByText("Ranking distribution", { exact: true }) })
    .last();
  await expect(distribution.getByText("Unknown", { exact: true })).toHaveCount(
    3,
  );
  await expect(distribution.getByText("0", { exact: true })).toHaveCount(1);
  await expect(
    distribution.getByText(/distribution shares are unavailable/),
  ).toBeVisible();
  await expect(distribution.locator('[style*="width:"]')).toHaveCount(0);
  await expect(page.getByText(/ranking shares are unknown/)).toBeVisible();
  await expect(
    page.getByText(
      /DataForSEO Labs estimates.*Captured.*2026-05-19.*Market 2840 \/ en/,
    ),
  ).toBeVisible();
  await page.reload();
  await expect(distribution.getByText("Unknown", { exact: true })).toHaveCount(
    3,
  );
  expect(paid).toEqual([]);
  expect(captured.errors).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/acceptance/provider-domain-unknown.png",
    fullPage: true,
  });
});

test("restored backlinks observations show history gaps and unavailable scores without replacing them with zero or spending", async ({
  page,
}) => {
  const captured = diagnostics(page);
  const paid = paidRequests(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/backlinks`);
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  await expect(
    page.getByText(/DataForSEO Backlinks.*Captured.*2026-05-19/),
  ).toBeVisible();
  await expect(
    page.getByText(/Some periods are unknown; chart gaps/),
  ).toHaveCount(3);
  await expect(
    page.getByLabel("Domain authority trend chart", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("New and lost backlinks chart", { exact: true }),
  ).toBeVisible();
  const authority = page
    .locator("div")
    .filter({ has: page.getByText("Domain authority", { exact: true }) })
    .filter({ has: page.getByText("Not available", { exact: true }) })
    .last();
  await expect(authority.getByText("—", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/Some periods are unknown; chart gaps/),
  ).toHaveCount(3);
  expect(paid).toEqual([]);
  expect(captured.errors).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/acceptance/provider-backlinks-unknown.png",
    fullPage: true,
  });
});
