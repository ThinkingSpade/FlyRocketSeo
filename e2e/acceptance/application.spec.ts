import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { diagnostics, dismissOldSetupModal, signIn } from "./helpers";
import { PAGE_URL, PROJECT_A, PROJECT_A2, PROJECT_B } from "./data";

test.afterAll(async () => {
  const serverLog = await readFile(
    "test-results/acceptance-server.log",
    "utf8",
  );
  expect(serverLog).not.toContain("ACCEPTANCE_EXTERNAL_REQUEST_BLOCKED");
});

test("optional provider setup never blocks free workflows, including navigation and reload", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_A}/search-performance`);
  await expect(
    page.getByRole("heading", { name: "Search Performance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "One quick setup step" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Overview", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "One quick setup step" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Overview|Primary acceptance/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "One quick setup step" }),
  ).toHaveCount(0);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/acceptance/optional-setup.png",
    fullPage: true,
  });
});

test("overview presents evidence, actions, changes and persisted work", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(`/p/${PROJECT_A}`);
  await dismissOldSetupModal(page);
  for (const heading of [
    "Next best actions",
    "Changes to investigate",
    "Progress and results",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/acceptance/overview.png",
    fullPage: true,
  });
});

test("page investigation starts on evidence and retains exact scope before provider research", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  const scope = new URLSearchParams({
    u: PAGE_URL,
    dateRange: "last_28_days",
    startDate: "2026-09-01",
    endDate: "2026-09-28",
    country: "usa",
    device: "MOBILE",
    searchType: "web",
  });
  await page.goto(`/p/${PROJECT_A}/page?${scope}`);
  await dismissOldSetupModal(page);
  await expect(
    page.getByRole("link", { name: "Evidence", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: "Provider research", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Page URL", { exact: true })).toHaveValue(
    PAGE_URL,
  );
  const retained = new URL(page.url()).searchParams;
  for (const [key, value] of scope) expect(retained.get(key)).toBe(value);
  await expect(page.getByRole("combobox", { name: /^Window/ })).toHaveValue(
    "custom",
  );
  await expect(page.getByLabel("Evidence start", { exact: true })).toHaveValue(
    "2026-09-01",
  );
  await expect(page.getByLabel("Evidence end", { exact: true })).toHaveValue(
    "2026-09-28",
  );
  await expect(
    page.getByRole("combobox", { name: /^Search type/ }),
  ).toHaveValue("web");
  await page.getByLabel("Evidence start", { exact: true }).fill("2026-09-02");
  await page.getByLabel("Evidence end", { exact: true }).fill("2026-09-29");
  await page
    .getByRole("combobox", { name: /^Search type/ })
    .selectOption("image");
  await page
    .getByRole("button", { name: "Load evidence", exact: true })
    .click();
  scope.set("startDate", "2026-09-02");
  scope.set("endDate", "2026-09-29");
  scope.set("searchType", "image");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("startDate"))
    .toBe("2026-09-02");
  for (const [key, value] of scope)
    expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  await expect(page.getByRole("combobox", { name: /^Window/ })).toHaveValue(
    "custom",
  );
  await expect(page.getByLabel("Evidence start", { exact: true })).toHaveValue(
    "2026-09-02",
  );
  await expect(page.getByLabel("Evidence end", { exact: true })).toHaveValue(
    "2026-09-29",
  );
  await expect(
    page.getByRole("combobox", { name: /^Search type/ }),
  ).toHaveValue("image");
  await expect
    .poll(async () =>
      new URL(
        (await page
          .getByRole("link", {
            name: "Review on-page suggestions",
            exact: true,
          })
          .getAttribute("href"))!,
        page.url(),
      ).searchParams.get("u"),
    )
    .toBe(PAGE_URL);
  await expect
    .poll(async () =>
      new URL(
        (await page
          .getByRole("link", {
            name: "Investigate internal links",
            exact: true,
          })
          .getAttribute("href"))!,
        page.url(),
      ).searchParams.get("q"),
    )
    .toBe("rocket guide");
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/acceptance/page-evidence.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Provider research", exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("pageView"))
    .toBe("research");
  for (const [key, value] of scope)
    expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  expect(captured.externalRequests).toEqual([]);
});

test("server access rejects a foreign organization project while same-org switching clears evidence", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/p/${PROJECT_A}/page?u=${encodeURIComponent(PAGE_URL)}`);
  await dismissOldSetupModal(page);
  await page.goto(`/p/${PROJECT_A2}/page`);
  await expect(page.getByText(PAGE_URL, { exact: true })).toHaveCount(0);
  await page.goto(`/p/${PROJECT_B}`);
  await expect(page).not.toHaveURL(new RegExp(`/p/${PROJECT_B}(?:$|/)`));
  await expect(
    page.getByText("Private beta acceptance", { exact: true }),
  ).toHaveCount(0);
});

test("a page action and progress survive a reload without crossing projects", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto(
    `/p/${PROJECT_A}/page?u=${encodeURIComponent(PAGE_URL)}&startDate=2026-08-03&endDate=2026-08-30`,
  );
  await dismissOldSetupModal(page);
  await expect(
    page.getByRole("heading", { name: "Page Investigation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save page action", exact: true })
    .click();
  await expect(
    page.getByText("Page action saved with its evidence.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open saved work", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved work", exact: true }),
  ).toBeVisible();
  const item = page.getByRole("article", {
    name: "Investigate page performance",
    exact: true,
  });
  await expect(item).toBeVisible();
  await item
    .getByRole("combobox", { name: /^Status/ })
    .selectOption("in_progress");
  await item
    .getByLabel("Implementation notes / reason", { exact: true })
    .fill("Acceptance investigation reviewed");
  await item
    .getByRole("button", { name: "Save progress", exact: true })
    .click();
  await expect(item.getByRole("combobox", { name: /^Status/ })).toHaveValue(
    "in_progress",
  );
  await page.reload();
  await expect(item.getByRole("combobox", { name: /^Status/ })).toHaveValue(
    "in_progress",
  );
  await item.getByText("Work history and evidence", { exact: true }).click();
  await expect(
    item
      .getByText("Acceptance investigation reviewed", { exact: false })
      .first(),
  ).toBeVisible();
  await item
    .getByRole("combobox", { name: /^Status/ })
    .selectOption("implemented");
  await item
    .getByLabel("Implementation date", { exact: true })
    .fill("2026-08-31");
  await item
    .getByLabel("Implementation notes / reason", { exact: true })
    .fill("Reviewed local fixture change");
  await item
    .getByRole("button", { name: "Save progress", exact: true })
    .click();
  await expect(
    item.getByText("Track observed results", { exact: true }),
  ).toBeVisible({ timeout: 45_000 });
  await item.getByText("Track observed results", { exact: true }).click();
  await item.getByLabel("After start", { exact: true }).fill("2026-09-07");
  await item.getByLabel("After end", { exact: true }).fill("2026-10-04");
  await item
    .getByRole("button", { name: "Measure results", exact: true })
    .click();
  await expect(
    item
      .getByRole("status")
      .getByText(/Association with recorded work, not proof of causation/),
  ).toBeVisible();
  await page.reload();
  await expect(item.getByRole("combobox", { name: /^Status/ })).toHaveValue(
    "measured",
  );
  await page.goto(`/p/${PROJECT_A2}/opportunities`);
  await expect(
    page.getByRole("heading", { name: "Saved work", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").filter({ hasText: PAGE_URL }),
  ).toHaveCount(0);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/acceptance/isolated-work.png",
    fullPage: true,
  });
});
