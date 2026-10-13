import { expect, test } from "@playwright/test";
import { diagnostics, serverFunctionName, signIn } from "./helpers";
import { findStoredObject, previewContains } from "./evidence-storage-helpers";
import {
  CLEANUP_AUTH_KEY,
  CLEANUP_BASELINE_KEY,
  CLEANUP_BUSY_KEY,
  CLEANUP_DELETED_PROJECT_KEY,
  CLEANUP_FOREIGN_KEY,
  CLEANUP_LEGACY_KEY,
  CLEANUP_ORPHAN_KEY,
  CLEANUP_RETRY_KEY,
  CLEANUP_QUOTA_KEYS,
  PROJECT_A,
} from "./data";

test("evidence cleanup requires an explicit preview and confirmation", async ({
  page,
}) => {
  const captured = diagnostics(page);
  const storageRequests: string[] = [];
  page.on("request", (request) => {
    const name = serverFunctionName(request.url());
    if (
      name?.startsWith("previewEvidenceCleanup_") ||
      name?.startsWith("cleanOrphanedEvidence_")
    )
      storageRequests.push(name);
  });
  await signIn(page);
  await page.goto("/settings");
  await page.getByText("Evidence storage", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preview stored evidence", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Delete selected orphaned evidence",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(storageRequests).toEqual([]);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
});

test("the authenticated application cleans a full five-object batch and leaves other evidence intact", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page, "b");
  await page.goto("/settings");
  await page.getByText("Evidence storage", { exact: true }).click();
  await findStoredObject(page, CLEANUP_QUOTA_KEYS[0]);
  await expect(
    page
      .getByRole("list", { name: "Stored evidence objects", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(5);
  for (const key of CLEANUP_QUOTA_KEYS)
    await page
      .getByRole("checkbox", { name: `Select ${key}`, exact: true })
      .check();
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page
    .getByRole("button", {
      name: "Delete selected orphaned evidence",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "5 evidence objects deleted. 0 skipped. 0 failed." }),
  ).toBeVisible();
  for (const key of CLEANUP_QUOTA_KEYS)
    expect(await previewContains(page, key)).toBe(false);
  await expect(await findStoredObject(page, CLEANUP_FOREIGN_KEY)).toBeEnabled();
  expect(captured.errors).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
});

test("failed SQL finalization can be retried explicitly after real R2 deletion", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto("/settings");
  await page.getByText("Evidence storage", { exact: true }).click();
  await (await findStoredObject(page, CLEANUP_RETRY_KEY)).check();
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page
    .getByRole("button", {
      name: "Delete selected orphaned evidence",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "0 evidence objects deleted. 0 skipped. 1 failed." }),
  ).toBeVisible();
  const retry = page.getByRole("button", {
    name: "Retry failed cleanup",
    exact: true,
  });
  await expect(retry).toBeVisible();
  const released = await page.request.post(
    "/__acceptance/release-cleanup-fault",
    {
      data: {},
      headers: { "x-acceptance-control": "local-fixture" },
    },
  );
  expect(released.ok()).toBe(true);
  await retry.click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 evidence objects deleted. 0 skipped. 0 failed." }),
  ).toBeVisible();
  await expect(retry).toHaveCount(0);
  expect(await previewContains(page, CLEANUP_RETRY_KEY)).toBe(false);
  expect(captured.errors).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
});

test("real R2 cleanup deletes selected orphans and preserves referenced baselines and history", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  await page.goto("/settings");
  await page.getByText("Evidence storage", { exact: true }).click();
  for (const key of [
    CLEANUP_BASELINE_KEY,
    CLEANUP_BUSY_KEY,
    CLEANUP_LEGACY_KEY,
  ])
    await expect(await findStoredObject(page, key)).toBeDisabled();
  expect(await previewContains(page, CLEANUP_FOREIGN_KEY)).toBe(false);
  for (const key of [CLEANUP_ORPHAN_KEY, CLEANUP_DELETED_PROJECT_KEY]) {
    const selected = await findStoredObject(page, key);
    await selected.check();
    const clean = page.getByRole("button", {
      name: "Delete selected orphaned evidence",
      exact: true,
    });
    await expect(clean).toBeDisabled();
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await selected.uncheck();
    await expect(
      page.getByLabel("Type DELETE to confirm", { exact: true }),
    ).toHaveCount(0);
    await selected.check();
    await expect(clean).toBeDisabled();
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await clean.click();
    await expect(
      page.getByRole("status").filter({
        hasText: "1 evidence objects deleted. 0 skipped. 0 failed.",
      }),
    ).toBeVisible();
  }
  for (const key of [CLEANUP_ORPHAN_KEY, CLEANUP_DELETED_PROJECT_KEY])
    expect(await previewContains(page, key)).toBe(false);
  await expect(
    await findStoredObject(page, CLEANUP_BASELINE_KEY),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/acceptance/evidence-storage.png",
    fullPage: true,
  });
  await page.goto(`/p/${PROJECT_A}/opportunities`);
  const baseline = page.getByRole("article", {
    name: "Storage baseline acceptance fixture",
    exact: true,
  });
  await expect(baseline.getByRole("combobox", { name: /^Status/ })).toHaveValue(
    "implemented",
  );
  await expect(
    baseline.getByLabel("Implementation date", { exact: true }),
  ).toHaveValue("2026-09-01");
  const history = page.getByRole("article", {
    name: "History acceptance fixture",
    exact: true,
  });
  await history.getByText("Work history and evidence", { exact: true }).click();
  await expect(history.getByText(/Acceptance history event 61/)).toBeVisible();
  expect(captured.errors).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
});

test("a forged cleanup RPC cannot delete another organization’s R2 evidence and anonymous cleanup is denied", async ({
  page,
}) => {
  await signIn(page);
  const rpc = { url: "", body: "" };
  page.on("request", (request) => {
    if (
      serverFunctionName(request.url())?.startsWith("cleanOrphanedEvidence_")
    ) {
      rpc.url = request.url();
      rpc.body = request.postData() ?? "";
    }
  });
  await page.goto("/settings");
  await page.getByText("Evidence storage", { exact: true }).click();
  await (await findStoredObject(page, CLEANUP_AUTH_KEY)).check();
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page
    .getByRole("button", {
      name: "Delete selected orphaned evidence",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 evidence objects deleted." }),
  ).toBeVisible();
  expect(rpc.url).not.toBe("");
  const headers = {
    "Content-Type": "application/json",
    "x-tsr-serverFn": "true",
    Origin: "http://localhost:3102",
  };
  const foreign = await page.request.post(rpc.url, {
    data: rpc.body.replaceAll(CLEANUP_AUTH_KEY, CLEANUP_FOREIGN_KEY),
    headers,
  });
  expect(await foreign.text()).toContain("outside_scope");
  await page.request.post("/api/auth/sign-out", {
    data: {},
    headers: { Origin: "http://localhost:3102" },
  });
  const anonymous = await page.request.post(rpc.url, {
    data: rpc.body,
    headers,
  });
  expect(await anonymous.text()).toContain("UNAUTHENTICATED");
  await signIn(page, "b");
  await page.goto("/settings");
  await page.getByText("Evidence storage", { exact: true }).click();
  await expect(await findStoredObject(page, CLEANUP_FOREIGN_KEY)).toBeEnabled();
  await expect(
    page.getByText(CLEANUP_BASELINE_KEY, { exact: true }),
  ).toHaveCount(0);
});
