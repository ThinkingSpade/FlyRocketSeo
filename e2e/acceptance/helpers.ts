import { expect, type Page } from "@playwright/test";
import { ACCEPTANCE_PASSWORD, ORG_A, ORG_B } from "./data";

function isFixtureAsset(url: URL) {
  return (
    url.hostname === "t0.gstatic.com" ||
    url.hostname === "tile.openstreetmap.org" ||
    (url.hostname === "www.google.com" && url.pathname === "/s2/favicons")
  );
}

export function serverFunctionName(requestUrl: string) {
  const path = new URL(requestUrl).pathname;
  if (!path.startsWith("/_serverFn/")) return null;
  try {
    const meta: unknown = JSON.parse(
      Buffer.from(path.slice("/_serverFn/".length), "base64url").toString(),
    );
    return meta &&
      typeof meta === "object" &&
      "export" in meta &&
      typeof meta.export === "string"
      ? meta.export
      : null;
  } catch {
    return null;
  }
}

export async function signIn(page: Page, suffix: "a" | "b" = "a") {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const host = url.hostname;
    if (["localhost", "127.0.0.1", "[::1]"].includes(host))
      return route.continue();
    if (isFixtureAsset(url))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" />',
      });
    return route.abort("blockedbyclient");
  });
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: {
      email: `acceptance-${suffix}@example.com`,
      password: ACCEPTANCE_PASSWORD,
    },
    headers: { Origin: "http://localhost:3102" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const organization = await page.request.post(
    "/api/auth/organization/set-active",
    {
      data: { organizationId: suffix === "a" ? ORG_A : ORG_B },
      headers: { Origin: "http://localhost:3102" },
    },
  );
  expect(organization.ok(), await organization.text()).toBe(true);
}

export function diagnostics(page: Page) {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const failedServerResponses: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !url.hostname ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      isFixtureAsset(url)
    )
      return;
    externalRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      response.status() >= 500
    )
      failedServerResponses.push(`${response.status()} ${url.pathname}`);
  });
  return { errors, externalRequests, failedServerResponses };
}

export async function dismissOldSetupModal(page: Page) {
  const modal = page.getByRole("dialog", { name: "One quick setup step" });
  if (await modal.isVisible())
    await modal.getByRole("button", { name: "Dismiss", exact: true }).click();
}
