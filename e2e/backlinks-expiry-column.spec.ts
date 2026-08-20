import { expect, test } from "@playwright/test";

/**
 * The backlinks expiry column, verified WITHOUT spending anything.
 *
 * Runs against the offline seed (`pnpm seed:backlinks-run`), whose referring
 * domains are synthetic (`source-01.com` …). Looking those up would burn ~145
 * APIVerve credits to learn nothing, so this deliberately stops short of
 * clicking: what it proves is the wiring, the billable-count arithmetic, and
 * that the cost is quoted before any click. The fetch itself is covered by the
 * live expiry spec and by unit tests.
 */
function serverFnTarget(url: string): string {
  const segment = url.split("/_serverFn/")[1];
  if (!segment) return "";
  try {
    return atob(segment.split("?")[0] ?? "");
  } catch {
    return "";
  }
}

test.describe("Backlinks domain-expiry column", () => {
  test("offers a per-page action that quotes its cost and spends nothing", async ({
    page,
  }) => {
    const expiryCalls: string[] = [];
    page.on("request", (request) => {
      const target = serverFnTarget(request.url());
      if (target.includes("domainExpiration")) expiryCalls.push(request.url());
    });

    await page.goto("/");
    await page.waitForURL(/\/p\/([^/]+)\/keywords(?:\?.*)?$/, {
      timeout: 30_000,
    });
    const match = page.url().match(/\/p\/([^/]+)\/keywords/);
    if (!match) throw new Error(`Could not read project id from ${page.url()}`);

    // No target in the URL: the tab restores the seeded run, which is free.
    await page.goto(`/p/${match[1]}/backlinks`);
    await expect(
      page.getByRole("heading", { name: /Backlinks/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();

    // A restored run shows the overview but not the individual links; the seed
    // wrote the links slice to the cache, so loading them is a cache hit.
    const loadLinks = page.getByRole("button", {
      name: /Refresh & load links/i,
    });
    if (await loadLinks.isVisible().catch(() => false)) {
      await loadLinks.click();
    }

    await page
      .getByRole("button", { name: "Backlinks table actions" })
      .click({ timeout: 45_000 });

    // The count is what THIS click would cost, and it must be stated up front.
    const expiryItem = page.getByText(/Domain expiry \(\d+ × 5 credits\)/);
    await expect(expiryItem).toBeVisible({ timeout: 15_000 });

    const label = (await expiryItem.textContent()) ?? "";
    const quoted = Number(/\((\d+) ×/.exec(label)?.[1] ?? "0");
    expect(quoted).toBeGreaterThan(0);

    // Opening the menu must not have billed anything.
    expect(
      expiryCalls,
      "the expiry action must not fire before it is clicked",
    ).toHaveLength(0);
  });
});
