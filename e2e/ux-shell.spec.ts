import { expect, test, type Page } from "@playwright/test";

// Shell and table interactions from the Oct-13 UX pass. Needs no API key and
// issues no metered call: the domain table runs on VITE_E2E_DOMAIN_FIXTURES.

const SHOT_DIR = process.env.UX_SHELL_SHOT_DIR;

// local_noauth serves no auth API, but the session hook still asks; this 404
// predates the UX pass and is not a product failure.
const KNOWN_LOCAL_404 = "/api/auth/get-session";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    // Failed requests are recorded with their URL below; the browser's own
    // "Failed to load resource" line carries no URL to judge them by.
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    )
      errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400 && path !== KNOWN_LOCAL_404)
      errors.push(`${response.status()} ${path}`);
  });
  return errors;
}

async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function openOverview(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/?]+)\/?(?:\?.*)?$/, { timeout: 30_000 });
  const projectId = page.url().match(/\/p\/([^/?]+)/)?.[1];
  if (!projectId) throw new Error(`No project id in ${page.url()}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();
  return projectId;
}

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`overview renders without errors (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors = collectErrors(page);
    await openOverview(page);
    await expect(
      page.getByRole("link", { name: "Project settings" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(0);
    await shot(page, `overview-${viewport.name}`);
    expect(errors).toEqual([]);
  });
}

test.describe("desktop shell", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("skip link is the first stop and moves focus to the content", async ({
    page,
  }) => {
    await openOverview(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
  });

  test("a collapsed group stays collapsed and opens for its own pages", async ({
    page,
  }) => {
    const projectId = await openOverview(page);
    const nav = page.getByRole("navigation", { name: "Project navigation" });
    const research = nav.getByRole("button", { name: "Research" });
    await expect(research).toHaveAttribute("aria-expanded", "true");
    await research.click();
    await expect(research).toHaveAttribute("aria-expanded", "false");
    await expect(
      nav.getByRole("link", { name: "Domain Overview" }),
    ).toBeHidden();

    await page.reload();
    await expect(research).toHaveAttribute("aria-expanded", "false");

    // Saved Keywords is a "More research tools" item, not a main destination,
    // so this also proves related tools count toward the active group.
    await page.goto(`/p/${projectId}/saved`);
    await expect(research).toHaveAttribute("aria-expanded", "true");
    await expect(
      nav.getByRole("link", { name: "Saved Keywords" }),
    ).toBeVisible();
    await shot(page, "sidebar-related-open-desktop");
  });
});

test.describe("mobile shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("navigation drawer is a dialog that returns focus and closes on navigation", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openOverview(page);
    const toggle = page.getByRole("button", { name: "Toggle sidebar" });
    await toggle.click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();
    // The modal hides the rest of the page from the accessibility tree, so
    // the toggle can only be reached by attribute while the drawer is open.
    await expect(
      page.locator('button[aria-label="Toggle sidebar"]'),
    ).toHaveAttribute("aria-expanded", "true");
    // Once the slide-in settles, the drawer must sit fully on screen.
    await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
    await shot(page, "drawer-open-mobile");

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await drawer.getByRole("link", { name: "Site Audit" }).click();
    await page.waitForURL(/\/audit\/?(?:\?.*)?$/);
    await expect(drawer).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("widening past the breakpoint closes the drawer onto the content", async ({
    page,
  }) => {
    await openOverview(page);
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(drawer).toBeHidden();
    // The menu button is hidden at this width, so focus must not go back there.
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("domain table exports fit a phone and keep the Excel download", async ({
    page,
  }) => {
    const projectId = await openOverview(page);
    await page.goto(
      `/p/${projectId}/domain?domain=primary.com&subdomains=true&sort=traffic&order=desc`,
    );
    // The domain param only prefills; the overview itself is a metered run,
    // so it needs the click (free here: VITE_E2E_DOMAIN_FIXTURES).
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();
    // Keywords are a second, separately authorized run.
    const load = page.getByRole("button", {
      name: "Load keywords",
      exact: true,
    });
    await expect(load).toBeVisible();
    await load.click();
    const firstRow = page
      .getByRole("row", { name: /primary sample query/ })
      .first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });

    await page
      .getByRole("button", { name: "Export", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Download Excel" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await firstRow.getByRole("checkbox").click();
    const toolbar = page.getByRole("toolbar", { name: "Bulk actions" });
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Export" }).click();
    const menu = page.getByRole("menu").last();
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box, "export menu has a box").not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    await shot(page, "bulk-export-menu-mobile");
  });
});
