import { expect, test, type Page } from "@playwright/test";

// Project subdomains and City Sites share one host list. Needs no API key and
// spends nothing: discovery is exercised through its free Search Console
// path only, and the spec asserts the paid source is never requested.

const DOMAIN = "primary.com";
const SHOT_DIR = process.env.UX_SHELL_SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function openSettingsWithDomain(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/?]+)\/?(?:\?.*)?$/, { timeout: 30_000 });
  const projectId = page.url().match(/\/p\/([^/?]+)/)?.[1];
  if (!projectId) throw new Error(`No project id in ${page.url()}`);

  await page.goto(`/p/${projectId}/settings`);
  const domainInput = page.getByPlaceholder("example.com", { exact: true });
  await expect(domainInput).toBeVisible();
  if ((await domainInput.inputValue()) !== DOMAIN) {
    await domainInput.fill(DOMAIN);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(domainInput).toHaveValue(DOMAIN);
  }
  await expect(
    page.getByRole("heading", { name: "Subdomains", exact: true }),
  ).toBeVisible();
  return projectId;
}

/** Every discovery request body seen, so the spec can prove what was asked. */
function watchDiscovery(page: Page) {
  const bodies: string[] = [];
  // Server functions are addressed by an encoded id, not by name; the
  // discovery call is the only one whose payload carries `sources`.
  page.on("request", (request) => {
    const body = request.postData() ?? "";
    if (request.url().includes("/_serverFn/") && body.includes('"sources"'))
      bodies.push(body);
  });
  return bodies;
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

test("settings discovers for free first and never requests the paid source unasked", async ({
  page,
}) => {
  const discovery = watchDiscovery(page);
  await openSettingsWithDomain(page);

  await expect(
    page.getByRole("button", { name: "Find subdomains (free)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Search organic results/ }),
  ).toContainText(/from \$\d+\.\d{2}/);
  // Opening the page requests no discovery of any kind.
  expect(discovery).toEqual([]);

  await page.getByRole("button", { name: "Find subdomains (free)" }).click();
  await expect.poll(() => discovery.length).toBe(1);
  expect(discovery[0]).toContain("gsc");
  expect(discovery[0]).not.toContain("dataforseo");
});

test("a city import upgrades a host the project already has", async ({
  page,
}) => {
  const projectId = await openSettingsWithDomain(page);

  // Start from a known list: remove whatever a previous run left.
  const selectAll = page.getByRole("checkbox", {
    name: "Select all shown subdomains",
  });
  if (await selectAll.isVisible()) {
    await selectAll.click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("No subdomains yet.")).toBeVisible();
  }

  await page
    .getByRole("textbox", { name: "Subdomain host" })
    .fill(`blog.${DOMAIN}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`blog.${DOMAIN}`, { exact: true })).toBeVisible();

  await page.goto(`/p/${projectId}/city-sites`);
  // The first visit compiles the City Sites chunk on the dev server.
  await expect(
    page.getByRole("heading", { name: "City Sites", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Import subdomains" }).first().click();
  await page
    .getByRole("textbox")
    .last()
    .fill(`austin.${DOMAIN}\nblog.${DOMAIN}`);
  await page.getByRole("button", { name: "Preview match" }).click();
  await page.getByRole("button", { name: "Import 2 sites" }).click();
  await expect(
    page.getByRole("checkbox", { name: `Select austin.${DOMAIN}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: `Select blog.${DOMAIN}` }),
  ).toBeVisible();
  await shot(page, "city-sites-desktop");

  // Back in settings: still two hosts, blog not duplicated, both city sites.
  await page.goto(`/p/${projectId}/settings`);
  await expect(page.getByText("2 of 2000")).toBeVisible();
  await expect(page.getByText(/City site/)).toHaveCount(2);
  await shot(page, "settings-subdomains-desktop");
});

test("removing from City Sites keeps the host in the subdomain list", async ({
  page,
}) => {
  const projectId = await openSettingsWithDomain(page);
  await page.goto(`/p/${projectId}/city-sites`);
  await page.getByRole("checkbox", { name: `Select blog.${DOMAIN}` }).click();
  await page.getByRole("button", { name: "Remove from City Sites" }).click();
  await expect(
    page.getByRole("checkbox", { name: `Select blog.${DOMAIN}` }),
  ).toHaveCount(0);

  await page.goto(`/p/${projectId}/settings`);
  await expect(page.getByText("2 of 2000")).toBeVisible();
  await expect(page.getByText(/City site/)).toHaveCount(1);
});
