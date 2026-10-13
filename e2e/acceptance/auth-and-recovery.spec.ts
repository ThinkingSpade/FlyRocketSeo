import { expect, test } from "@playwright/test";
import { diagnostics, serverFunctionName, signIn } from "./helpers";
import { PROJECT_A, PROJECT_B } from "./data";

test("each real account opens its selected workspace and foreign project access fails", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page, "b");
  await page.goto(`/p/${PROJECT_B}`);
  await expect(
    page.getByRole("heading", { name: "Private beta acceptance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch project", exact: true }),
  ).toContainText("Private beta acceptance");
  await page.request.post("/api/auth/sign-out", {
    data: {},
    headers: { Origin: "http://localhost:3102" },
  });
  await signIn(page, "a");
  await page.goto(`/p/${PROJECT_A}`);
  await expect(
    page.getByRole("heading", { name: "Primary acceptance", exact: true }),
  ).toBeVisible();
  await page.goto(`/p/${PROJECT_B}`);
  await expect(page).not.toHaveURL(new RegExp(`/p/${PROJECT_B}(?:$|/)`));
  await expect(
    page.getByText("Private beta acceptance", { exact: true }),
  ).toHaveCount(0);
  expect(captured.errors).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("an invalidated hosted session sends the real app to sign-in", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/p/${PROJECT_A}`);
  await expect(
    page.getByRole("heading", { name: "Primary acceptance", exact: true }),
  ).toBeVisible();
  const response = await page.request.post("/api/auth/sign-out", {
    data: {},
    headers: { Origin: "http://localhost:3102" },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "Primary acceptance", exact: true }),
  ).toHaveCount(0);
});

test("transient project access transport failure stays on the route and retries against the real server", async ({
  page,
}) => {
  await signIn(page);
  let unavailable = true;
  await page.route("**/_serverFn/**", async (route) => {
    if (
      serverFunctionName(route.request().url())?.startsWith(
        "getProjectAccess_",
      ) &&
      unavailable
    ) {
      return route.fulfill({
        status: 503,
        body: "Temporary test transport outage",
        contentType: "text/plain",
      });
    }
    return route.fallback();
  });
  await page.goto(`/p/${PROJECT_A}`);
  await expect(
    page.getByText(/Could not|couldn't|unable to|verify.*project/i).first(),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/p/${PROJECT_A}`);
  unavailable = false;
  await page.getByRole("button", { name: /Retry/i }).click();
  await expect(
    page.getByRole("heading", { name: "Primary acceptance", exact: true }),
  ).toBeVisible();
});

test("tampered project RPC data is denied by real server authorization", async ({
  page,
}) => {
  await signIn(page);
  const rpc = { url: "", body: "" };
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getProjectAccess_")) {
      rpc.url = request.url();
      rpc.body = request.postData() ?? "";
    }
  });
  await page.goto(`/p/${PROJECT_A}`);
  await expect(
    page.getByRole("heading", { name: "Primary acceptance", exact: true }),
  ).toBeVisible();
  expect(rpc.url).not.toBe("");
  const forged = await page.request.post(rpc.url, {
    data: rpc.body.replaceAll(PROJECT_A, PROJECT_B),
    headers: {
      "Content-Type": "application/json",
      "x-tsr-serverFn": "true",
      Origin: "http://localhost:3102",
    },
  });
  expect(await forged.text()).toContain("NOT_FOUND");
  await page.request.post("/api/auth/sign-out", {
    data: {},
    headers: { Origin: "http://localhost:3102" },
  });
  const anonymous = await page.request.post(rpc.url, {
    data: rpc.body,
    headers: {
      "Content-Type": "application/json",
      "x-tsr-serverFn": "true",
      Origin: "http://localhost:3102",
    },
  });
  expect(await anonymous.text()).toContain("UNAUTHENTICATED");
});
