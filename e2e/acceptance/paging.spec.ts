import { expect, test } from "@playwright/test";
import { diagnostics, signIn } from "./helpers";
import { PROJECT_PAGING } from "./data";

test("saved work pages older tasks and filters the entire project collection", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_PAGING}/opportunities`);
  const tasks = page.getByRole("article", {
    name: /^Paging acceptance fixture/,
  });
  await expect(tasks).toHaveCount(100);
  await expect(page.getByText("Work page 1", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("article", {
      name: "Paging acceptance fixture 121",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next work", exact: true }).click();
  await expect(tasks).toHaveCount(21);
  await expect(page.getByText("Work page 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("article", {
      name: "Paging acceptance fixture 121",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous work", exact: true })
    .click();
  await expect(tasks).toHaveCount(100);
  await page
    .getByRole("combobox", { name: /^Work status/ })
    .selectOption("dismissed");
  await expect(tasks).toHaveCount(1);
  await expect(
    page.getByRole("article", {
      name: "Paging acceptance fixture 121",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Work page 1", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next work", exact: true }),
  ).toBeDisabled();
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
