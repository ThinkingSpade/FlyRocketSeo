import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { diagnostics, signIn } from "./helpers";
import { PROJECT_A2, PROJECT_OPERATIONS } from "./data";

test("Keyword unknown and genuine zero metrics retain their original capture through CSV, saving, tags and removal", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_A2}/keywords`);
  await page.waitForLoadState("networkidle");
  await page
    .getByPlaceholder("Enter keywords, one per line")
    .fill("contract keyword");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const unknown = page.getByRole("row", {
    name: /^Select row contract keyword unknown/,
  });
  const zero = page.getByRole("row", {
    name: /^Select row contract keyword zero/,
  });
  await expect(unknown).toContainText("—");
  await expect(zero).toContainText("0");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const researchDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV", exact: true }).click();
  const researchCsv = await readFile(
    await (await researchDownload).path(),
    "utf8",
  );
  expect(researchCsv).toContain("DataForSEO Labs");
  expect(researchCsv).toContain("2026-10-01T12:00:00.000Z");
  expect(researchCsv).toMatch(/contract keyword unknown"?,"?"?,"?"?,"?"?,"?"?/);
  expect(researchCsv).toMatch(
    /contract keyword zero"?,"?0"?,"?0(?:\.00)?"?,"?0(?:\.00)?"?,"?0"?/,
  );
  await unknown
    .getByRole("checkbox", { name: "Select row", exact: true })
    .check();
  await zero.getByRole("checkbox", { name: "Select row", exact: true }).check();
  await page
    .getByRole("button", { name: "Save Keywords", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save 2 Keywords", exact: true })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.goto(`/p/${PROJECT_A2}/saved`);
  await expect(
    page.getByRole("row", { name: /contract keyword unknown/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  const include = page.getByPlaceholder("Must contain… e.g. audit");
  await include.fill("absent-fixture");
  await include.press("Enter");
  await expect(page.getByRole("row", { name: /contract keyword/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(
    page.getByRole("row", { name: /contract keyword zero/ }),
  ).toBeVisible();
  await page
    .getByRole("row", { name: /contract keyword zero/ })
    .getByRole("checkbox", { name: "Select row", exact: true })
    .check();
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const tags = page.getByRole("dialog", { name: "Update tags", exact: true });
  await tags
    .getByPlaceholder("Search or create…")
    .fill("Acceptance contract tag");
  await tags.getByRole("button", { name: /Create/ }).click();
  await tags
    .getByRole("button", { name: /Apply|Update/, exact: false })
    .last()
    .click();
  await expect(tags).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("row", { name: /contract keyword zero/ }),
  ).toContainText("Acceptance contract tag");
  await page
    .getByRole("button", { name: "Export", exact: true })
    .first()
    .click();
  const savedDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV", exact: true }).click();
  const savedCsv = await readFile(await (await savedDownload).path(), "utf8");
  expect(savedCsv).toContain("2026-10-01T12:00:00.000Z");
  expect(savedCsv).toContain(PROJECT_A2);
  await page
    .getByRole("row", { name: /contract keyword unknown/ })
    .getByRole("checkbox", { name: "Select row", exact: true })
    .check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete keywords?", exact: true })
    .getByRole("button", { name: "Delete 1 keyword", exact: true })
    .click();
  await expect(
    page.getByRole("row", { name: /contract keyword unknown/ }),
  ).toHaveCount(0);
  await page.goto(`/p/${PROJECT_OPERATIONS}/saved`);
  await expect(
    page.getByRole("row", { name: /contract keyword zero/ }),
  ).toHaveCount(0);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
