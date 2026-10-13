import { expect, test } from "@playwright/test";
import { diagnostics, signIn } from "./helpers";
import { PAGE_URL, PROJECT_A } from "./data";

test("a contextual link uses captured text and refuses a destination already linked", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(
    `/p/${PROJECT_A}/page?u=${encodeURIComponent(PAGE_URL)}&startDate=2026-08-03&endDate=2026-08-30`,
  );
  await page
    .getByText("Prepare a contextual internal link", { exact: true })
    .click();
  await page
    .getByLabel("Candidate destination URL", { exact: true })
    .fill("https://primary.example/healthy");
  await page
    .getByLabel("Candidate anchor", { exact: true })
    .fill("rocket guide");
  await page
    .getByRole("button", {
      name: "Check text and save link action",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Link candidate saved with captured source evidence.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Candidate destination URL", { exact: true })
    .fill("https://primary.example/existing");
  await page
    .getByRole("button", {
      name: "Check text and save link action",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      /No unlinked candidate observed: Destination is already linked/,
    ),
  ).toBeVisible();
  await page.goto(`/p/${PROJECT_A}/opportunities`);
  const item = page.getByRole("article", {
    name: "Review a contextual internal link",
    exact: true,
  });
  await expect(item).toHaveCount(1);
  await expect(item.getByText(/Candidate anchor: rocket guide/)).toBeVisible();
  await expect(
    item.getByText(/This rocket guide explains launch preparation/),
  ).toBeVisible();
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
