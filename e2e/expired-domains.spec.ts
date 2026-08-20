import { expect, test } from "@playwright/test";

/**
 * The expired-domain finder panel, verified WITHOUT spending anything.
 *
 * Unlike `domain-expiration-live.spec.ts` this needs no API key and no
 * `APIVERVE_LIVE` guard, because it never authorizes the run. What it proves is
 * the property that actually protects the bill: the panel mounts idle, quotes
 * its ceiling up front, and issues no metered request until a human clicks.
 *
 * That is deliberately the assertion worth having on every CI run. Verifying
 * the populated table needs real candidates and real credits, so it belongs in
 * a live spec rather than here.
 */

/** Decodes a TanStack server-function URL to the source file it dispatches to. */
function serverFnTarget(url: string): string {
  const segment = url.split("/_serverFn/")[1];
  if (!segment) return "";
  try {
    return atob(segment.split("?")[0] ?? "");
  } catch {
    return "";
  }
}

test.describe("Expired domains panel", () => {
  test("mounts idle, quotes the ceiling, and spends nothing until clicked", async ({
    page,
  }) => {
    const meteredCalls: string[] = [];
    page.on("request", (request) => {
      const target = serverFnTarget(request.url());
      if (target.includes("expiredDomains")) meteredCalls.push(request.url());
    });

    await page.goto("/");
    await page.waitForURL(/\/p\/([^/]+)\/keywords(?:\?.*)?$/, {
      timeout: 30_000,
    });
    const match = page.url().match(/\/p\/([^/]+)\/keywords/);
    if (!match) throw new Error(`Could not read project id from ${page.url()}`);

    await page.goto(`/p/${match[1]}/expired-domains`);

    await expect(
      page.getByRole("heading", { name: "Expired Domains" }),
    ).toBeVisible({ timeout: 30_000 });

    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();

    const panel = page.getByTestId("expired-domains-panel");
    await expect(panel).toBeVisible();

    // The cost ceiling has to be on screen BEFORE the button, not discovered
    // after the money is gone.
    await expect(panel).toContainText("Up to 50 domains");
    await expect(panel).toContainText("250 APIVerve credits");
    await expect(
      page.getByRole("button", { name: "Find expired domains" }),
    ).toBeVisible();

    // The honest-scope line: this searches the project's graph, not the whole
    // expired-domain universe.
    await expect(
      page.getByText(/does not scan every\s+expired domain/i),
    ).toBeVisible();

    expect(
      meteredCalls,
      "the panel must not call the metered endpoint before an explicit click",
    ).toHaveLength(0);
  });

  test("is reachable from the Research nav", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/p\/([^/]+)\/keywords(?:\?.*)?$/, {
      timeout: 30_000,
    });

    const link = page.getByRole("link", { name: "Expired Domains" });
    await expect(link).toBeVisible();
    await link.click();

    await expect(
      page.getByRole("heading", { name: "Expired Domains" }),
    ).toBeVisible();
  });
});
