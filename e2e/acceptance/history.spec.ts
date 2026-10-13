import { expect, test } from "@playwright/test";
import { diagnostics, serverFunctionName, signIn } from "./helpers";
import { PROJECT_A, PROJECT_B } from "./data";

test("bounded work history loads older events and denies a foreign project RPC", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  const rpc = { url: "", body: "" };
  page.on("request", (request) => {
    if (
      serverFunctionName(request.url())?.startsWith("getOpportunityHistory_")
    ) {
      rpc.url = request.url();
      rpc.body = request.postData() ?? "";
    }
  });
  await page.goto(`/p/${PROJECT_A}/opportunities`);
  const item = page.getByRole("article", {
    name: "History acceptance fixture",
    exact: true,
  });
  await item.getByText("Work history and evidence", { exact: true }).click();
  const history = item.locator("details").filter({
    has: page.getByText("Work history and evidence", { exact: true }),
  });
  await expect(history.getByRole("listitem")).toHaveCount(50);
  await expect(
    history.getByText(/Acceptance history oldest entry/),
  ).toHaveCount(0);
  await item
    .getByRole("button", { name: "Load older history", exact: true })
    .click();
  await expect(history.getByRole("listitem")).toHaveCount(61);
  await expect(
    history.getByText(/Acceptance history oldest entry/),
  ).toBeVisible();
  await expect(
    item.getByRole("button", { name: "Load older history", exact: true }),
  ).toHaveCount(0);
  expect(rpc.url).not.toBe("");
  const foreign = await page.request.post(rpc.url, {
    data: rpc.body.replaceAll(PROJECT_A, PROJECT_B),
    headers: {
      "Content-Type": "application/json",
      "x-tsr-serverFn": "true",
      Origin: "http://localhost:3102",
    },
  });
  expect(await foreign.text()).toMatch(/NOT_FOUND|FORBIDDEN/);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
