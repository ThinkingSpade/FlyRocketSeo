import { expect, test } from "@playwright/test";
import { PROJECT_A2 } from "./data";
import {
  diagnostics,
  serverFunctionName,
  signIn,
  submitWithPendingCheck,
} from "./helpers";

test("selecting another restored brief requires its own outline authorization", async ({
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
  await page.goto(`/p/${PROJECT_A2}/content`);
  for (const keyword of [
    "operation consent rocket",
    "operation secondary rocket",
  ]) {
    await page.getByPlaceholder("office coffee service dallas").fill(keyword);
    await submitWithPendingCheck(
      page,
      "getContentBrief_",
      page.getByRole("button", { name: /^Build brief/ }),
    );
    await expect(
      page.getByText(new RegExp(`Brief for .*${keyword}.*SERP captured`)),
    ).toBeVisible();
  }
  expect(outlines).toBe(0);
  await page.reload();
  await expect(
    page.getByText(/Brief for .*operation secondary rocket.*SERP captured/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Analyze competitor outlines", exact: true })
    .click();
  await expect(
    page.getByText("Preparing a rocket launch", { exact: true }).first(),
  ).toBeVisible();
  expect(outlines).toBe(2);
  await page.getByRole("button", { name: /^operation consent rocket/ }).click();
  await expect(
    page.getByText(/Brief for .*operation consent rocket.*SERP captured/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Analyze competitor outlines",
      exact: true,
    }),
  ).toBeVisible();
  expect(outlines).toBe(2);
  await page
    .getByRole("button", { name: "Analyze competitor outlines", exact: true })
    .click();
  await expect(
    page.getByText("Preparing a rocket launch", { exact: true }).first(),
  ).toBeVisible();
  expect(outlines).toBe(4);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
