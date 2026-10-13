import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { diagnostics, signIn } from "./helpers";
import { PROJECT_A, PROJECT_A2 } from "./data";

test("keyword search filters, sorting, CSV and saving use the real page and project database", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_A}/keywords`);
  await page
    .getByPlaceholder("Enter keywords, one per line")
    .fill("acceptance keyword");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("row", { name: /^Select row acceptance keyword tools/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByPlaceholder("audit, checker, template").fill("template");
  await expect(
    page.getByRole("row", { name: /^Select row acceptance keyword template/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /^Select row acceptance keyword tools/i }),
  ).toHaveCount(0);
  await page
    .getByPlaceholder("audit, checker, template")
    .fill("term absent from fixtures");
  await expect(
    page
      .getByText("No keywords match your current filters.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  const volume = page.getByRole("button", { name: /^Volume/ });
  await volume.click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("order"))
    .toBe("asc");
  await expect(
    page.locator("tbody tr").filter({ visible: true }).first(),
  ).toContainText("acceptance keyword generator");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("keyword-research.csv");
  const csv = await readFile(await download.path(), "utf8");
  expect(csv.split(/\r?\n/)[0].replaceAll('"', "")).toBe(
    "Keyword,Volume,CPC,Competition,Score,Intent,Source,Project ID,Location Code,Language,Clickstream,Fetched At",
  );
  expect(csv).toContain("acceptance keyword tools");
  await page
    .getByRole("row", { name: /^Select row acceptance keyword tools/i })
    .getByRole("checkbox", { name: "Select row", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save Keywords", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Save 1 Keywords",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/p/${PROJECT_A}/saved`);
  await expect(
    page.getByRole("row", { name: /acceptance keyword tools/i }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("row", { name: /acceptance keyword tools/i }),
  ).toBeVisible();
  await page.goto(`/p/${PROJECT_A2}/saved`);
  await expect(
    page.getByRole("heading", { name: "Saved Keywords", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /acceptance keyword tools/i }),
  ).toHaveCount(0);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("domain research requires submit and separate keyword authorization, then exports fixture rows", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_A}/domain`);
  await page.getByPlaceholder("Enter a domain").fill("primary.com");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Load keywords", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load keywords", exact: true })
    .click();
  await expect(
    page.getByRole("row", { name: /primary sample query/i }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByPlaceholder("Min", { exact: true }).first().fill("10");
  await page.getByRole("button", { name: /^Apply/ }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("minTraffic"))
    .toBe("10");
  if (
    await page
      .getByRole("button", { name: "Load keywords", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Load keywords", exact: true })
      .click();
  await expect(
    page.getByRole("row", { name: /primary sample query/i }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Download CSV", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("primary.com-keywords.csv");
  expect(await readFile(await download.path(), "utf8")).toContain(
    "primary sample query",
  );
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
