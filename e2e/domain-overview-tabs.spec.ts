import { expect, test, type Page } from "@playwright/test";
import {
  PRIMARY_TEST_DOMAIN,
  SECONDARY_TEST_DOMAIN,
  openDomainOverview,
} from "./domain-overview-test-utils";

/**
 * Names of the server functions the page called. The URL id is base64url
 * (note the `_`), so it must be converted before `atob` -- a bare `atob`
 * throws on it and would silently count nothing.
 */
function watchServerFunctions(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const segment = request.url().split("/_serverFn/")[1]?.split("?")[0];
    if (!segment) return;
    try {
      const decoded = atob(segment.replaceAll("-", "+").replaceAll("_", "/"));
      const name = /"export":"([^"]+)"/.exec(decoded)?.[1];
      if (name) calls.push(name);
    } catch {
      // Not a server-function id.
    }
  });
  return calls;
}

const overviewRequests = (calls: readonly string[]) =>
  calls.filter((name) => name.includes("getDomainOverview")).length;

/** The fixture verdict names the domain its numbers belong to. */
const verdictFor = (page: Page, domain: string) =>
  page.getByText(
    new RegExp(`of ${domain.replace(".", "\\.")}.s \\d+ ranked keywords`),
  );

async function searchDomain(page: Page, domain: string) {
  await page.getByPlaceholder("Enter a domain").fill(domain);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(verdictFor(page, domain)).toBeVisible({ timeout: 30_000 });
}

test.describe("Domain Overview search tabs", () => {
  test("each tab shows its own domain, and switching tabs spends nothing", async ({
    page,
  }) => {
    const calls = watchServerFunctions(page);
    await openDomainOverview(page, "keywords");
    await expect(verdictFor(page, PRIMARY_TEST_DOMAIN)).toBeVisible();
    await searchDomain(page, SECONDARY_TEST_DOMAIN);
    expect(overviewRequests(calls)).toBe(2);

    await page.getByRole("tab", { name: PRIMARY_TEST_DOMAIN }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("domain"))
      .toBe(PRIMARY_TEST_DOMAIN);
    await expect(verdictFor(page, PRIMARY_TEST_DOMAIN)).toBeVisible();
    await expect(verdictFor(page, SECONDARY_TEST_DOMAIN)).toHaveCount(0);

    await page.getByRole("tab", { name: SECONDARY_TEST_DOMAIN }).click();
    await expect(verdictFor(page, SECONDARY_TEST_DOMAIN)).toBeVisible();
    // Both overviews came from the cache: no metered request on a switch.
    expect(overviewRequests(calls)).toBe(2);
  });

  test("a tab not run this session asks before running, and spends nothing until asked", async ({
    page,
  }) => {
    await openDomainOverview(page, "keywords");
    // A reload keeps the tab (stored per project) but not its result.
    await page.reload();
    const calls = watchServerFunctions(page);
    await expect(
      page.getByText(
        `Results for ${PRIMARY_TEST_DOMAIN} are not loaded in this session`,
      ),
    ).toBeVisible({ timeout: 30_000 });

    await searchDomain(page, SECONDARY_TEST_DOMAIN);
    expect(overviewRequests(calls)).toBe(1);

    await page.getByRole("tab", { name: PRIMARY_TEST_DOMAIN }).click();
    await expect(
      page.getByText(
        `Results for ${PRIMARY_TEST_DOMAIN} are not loaded in this session`,
      ),
    ).toBeVisible();
    // Not the other domain's overview, and no request from the click.
    await expect(verdictFor(page, SECONDARY_TEST_DOMAIN)).toHaveCount(0);
    expect(overviewRequests(calls)).toBe(1);

    await page
      .getByRole("button", { name: `Analyze ${PRIMARY_TEST_DOMAIN}` })
      .click();
    await expect(verdictFor(page, PRIMARY_TEST_DOMAIN)).toBeVisible({
      timeout: 30_000,
    });
    expect(overviewRequests(calls)).toBe(2);
  });

  test("Recent searches leaves the overview for the list", async ({ page }) => {
    await openDomainOverview(page, "keywords");
    await expect(verdictFor(page, PRIMARY_TEST_DOMAIN)).toBeVisible();

    await page.getByRole("button", { name: "Recent searches" }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("domain"))
      .toBe(null);
    await expect(page.getByText(/recent search/i).first()).toBeVisible();
    await expect(verdictFor(page, PRIMARY_TEST_DOMAIN)).toHaveCount(0);
  });
});
