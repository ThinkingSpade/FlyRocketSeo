import { expect, test } from "@playwright/test";

/**
 * Live verification of the Domain Overview expiry card.
 *
 * OPT-IN ONLY. This spec makes a real, billed APIVerve request (5 credits), so
 * it is skipped unless `APIVERVE_LIVE=1` is set on the runner. A paid call must
 * never fire from an ordinary `pnpm test:e2e`.
 *
 *   APIVERVE_LIVE=1 pnpm exec playwright test e2e/domain-expiration-live.spec.ts
 *
 * The Domain Overview itself runs on E2E fixtures (VITE_E2E_DOMAIN_FIXTURES=1,
 * see playwright.config.ts), so `hasData` is true and the card mounts without
 * spending a single DataForSEO credit. `getFixtureOverview` echoes back
 * whatever domain it is given, which is what lets the page render a free
 * overview for a REAL domain while the card independently resolves that
 * domain's genuine registration data.
 */

const LIVE_DOMAIN = "deliotx.com";

/** Decodes a TanStack server-function URL to the source file it dispatches to.
 *  The path segment is base64 of `{"file":"/src/serverFunctions/…"}`. */
function serverFnTarget(url: string): string {
  const segment = url.split("/_serverFn/")[1];
  if (!segment) return "";
  try {
    return atob(segment.split("?")[0] ?? "");
  } catch {
    return "";
  }
}

test.describe("Domain Overview expiry card", () => {
  test.skip(
    process.env.APIVERVE_LIVE !== "1",
    "Set APIVERVE_LIVE=1 to run this billed live check.",
  );

  test("stays silent until clicked, then shows real registration data", async ({
    page,
  }) => {
    const expirationCalls: string[] = [];
    page.on("request", (request) => {
      const target = serverFnTarget(request.url());
      if (target.includes("domainExpiration")) {
        expirationCalls.push(request.url());
      }
    });

    await page.goto("/");
    await page.waitForURL(/\/p\/([^/]+)\/keywords(?:\?.*)?$/, {
      timeout: 30_000,
    });
    const match = page.url().match(/\/p\/([^/]+)\/keywords/);
    if (!match) throw new Error(`Could not read project id from ${page.url()}`);

    await page.goto(
      `/p/${match[1]}/domain?domain=${LIVE_DOMAIN}&subdomains=true&sort=traffic&order=desc`,
    );
    await expect(
      page.getByRole("heading", { name: "Domain Overview" }),
    ).toBeVisible();

    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();

    // The `domain` search param only PREFILLS the input -- the overview is
    // itself a metered query, so it waits for an explicit submit. Under
    // VITE_E2E_DOMAIN_FIXTURES that submit is free, which is what makes this
    // whole spec cost one APIVerve call and zero DataForSEO credits.
    await expect(page.getByPlaceholder("Enter a domain")).toHaveValue(
      LIVE_DOMAIN,
    );
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // Anchored on a testid rather than matching a bare `div` by its text: the
    // text filter could drift onto an ancestor, and an assertion like
    // `not.toContainText("—")` would then be reading the whole page.
    const card = page.getByTestId("domain-expiration-card");
    const runButton = page.getByRole("button", { name: "Check domain health" });

    // The whole point of the card: it mounts idle. If this button is absent,
    // or if a request already fired, the no-auto-spend rule is broken.
    await expect(runButton).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Domain registration");
    expect(
      expirationCalls,
      "the card must not call a metered endpoint before an explicit click",
    ).toHaveLength(0);

    await runButton.click();

    // Real registration facts for a real domain -- an em dash here would mean
    // the derive step produced null where it should have produced a value.
    await expect(card).toContainText(/Expires/);
    await expect(card).toContainText(/Days left/);
    await expect(card).toContainText(/Age/);
    await expect(card).not.toContainText("—", { timeout: 20_000 });

    // Exactly one billed call for one click.
    expect(expirationCalls).toHaveLength(1);

    const daysLeft = await card
      .locator("dd")
      .nth(1)
      .textContent({ timeout: 10_000 });
    const parsedDays = Number((daysLeft ?? "").replace(/[^0-9-]/g, ""));
    expect(Number.isFinite(parsedDays)).toBe(true);
    expect(parsedDays).toBeGreaterThan(0);
  });
});
