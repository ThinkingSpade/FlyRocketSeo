import { expect, type Page } from "@playwright/test";
import { serverFunctionName } from "./helpers";

async function previewBatch(page: Page, next = false) {
  const completed = page.waitForResponse(
    (response) =>
      serverFunctionName(response.url())?.startsWith(
        "previewEvidenceCleanup_",
      ) === true,
  );
  await page
    .getByRole("button", {
      name: next ? "Preview next batch" : "Preview stored evidence",
      exact: true,
    })
    .click();
  await completed;
  await expect(
    page.getByRole("button", { name: "Preview stored evidence", exact: true }),
  ).toBeEnabled();
  const list = page.getByRole("list", {
    name: "Stored evidence objects",
    exact: true,
  });
  if (await list.count())
    expect(await list.getByRole("listitem").count()).toBeLessThanOrEqual(5);
}

export async function previewContains(page: Page, key: string) {
  await previewBatch(page);
  for (let batch = 0; batch < 20; batch++) {
    if (
      await page
        .getByRole("checkbox", { name: `Select ${key}`, exact: true })
        .count()
    )
      return true;
    if (
      !(await page
        .getByRole("button", { name: "Preview next batch", exact: true })
        .count())
    )
      return false;
    await previewBatch(page, true);
  }
  throw new Error(
    "Acceptance evidence preview did not finish within 20 batches",
  );
}

export async function findStoredObject(page: Page, key: string) {
  expect(
    await previewContains(page, key),
    `Missing isolated fixture ${key}`,
  ).toBe(true);
  return page.getByRole("checkbox", { name: `Select ${key}`, exact: true });
}
