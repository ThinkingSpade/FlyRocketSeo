import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Real application + router + local D1; existing test-only keyword/domain
// fixtures are enabled by the CI environment. No production secrets are used.
const out = process.env.UX_EVIDENCE_DIR || "ux-evidence";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (["127.0.0.1", "localhost"].includes(url.hostname))
    return route.continue();
  if (["data:", "blob:", "about:"].includes(url.protocol))
    return route.continue();
  return route.abort("blockedbyclient");
});
const page = await context.newPage();
const result = {
  evidence: "Isolated local application; fixtures are NOT live SEO findings",
  screens: [],
  checks: [],
  consoleErrors: [],
  failedRequests: [],
};
page.on("pageerror", (error) => result.consoleErrors.push(String(error)));
page.on("response", (response) => {
  if (response.status() >= 400)
    result.failedRequests.push({
      url: response.url(),
      status: response.status(),
    });
});
const check = async (name, test) => {
  try {
    const details = await test();
    result.checks.push({ name, pass: details !== false, details });
  } catch (error) {
    result.checks.push({
      name,
      pass: false,
      error: String(error),
      url: page.url(),
      activeElement: await page
        .evaluate(() => document.activeElement?.outerHTML)
        .catch(() => null),
      openDialogs: await page
        .getByRole("dialog")
        .allTextContents()
        .catch(() => []),
    });
  }
};
async function settle() {
  await page.waitForTimeout(1100);
  await page
    .locator("h1")
    .first()
    .waitFor({ timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(1100);
}
async function stamp() {
  await page.evaluate(() => {
    let label = document.getElementById("ux-evidence-label");
    if (!label) {
      label = document.createElement("div");
      label.id = "ux-evidence-label";
      document.body.append(label);
    }
    label.textContent = "ISOLATED UX TEST · NOT LIVE SEO DATA";
    label.style.cssText =
      "position:fixed;bottom:4px;right:4px;padding:3px 7px;background:#171717;color:white;font:10px system-ui;z-index:10000;pointer-events:none;border-radius:4px;";
  });
}
async function capture(name) {
  await stamp();
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const details = await page.evaluate(() => ({
    width: innerWidth,
    heading: document.querySelector("h1")?.textContent,
    text: document.body.innerText.slice(0, 14000),
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    overflowing: [...document.querySelectorAll("main *, [data-app-page] *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.right > innerWidth + 2 &&
          getComputedStyle(el).position !== "fixed"
        );
      })
      .slice(0, 12)
      .map((el) => ({ tag: el.tagName, text: el.textContent.slice(0, 70) })),
  }));
  result.screens.push({ name, url: page.url(), ...details });
}
try {
  await page.goto("http://127.0.0.1:3101/", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForURL(/\/p\/[^/]+/, { timeout: 120000 });
  await settle();
  const projectId = new URL(page.url()).pathname.split("/")[2];
  result.projectId = projectId;
  await check(
    "Optional provider setup never blocks the workspace",
    async () =>
      !(await page
        .getByRole("dialog", { name: "One quick setup step" })
        .isVisible()),
  );
  if (
    await page.getByRole("button", { name: "Dismiss", exact: true }).isVisible()
  )
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await check(
    "A main landmark and skip link exist",
    async () =>
      (await page.getByRole("main").count()) === 1 &&
      (await page.getByRole("link", { name: "Skip to content" }).count()) === 1,
  );
  await check(
    "Dashboard leads with performance and exposes next actions",
    async () => {
      const main = page.getByRole("main");
      const performance = main.getByText("Search performance · last 28 days", {
        exact: true,
      });
      const actions = main.getByText("What to work on next", { exact: true });
      await expect(actions).toBeVisible();
      const p = await performance.first().boundingBox();
      const a = await actions.boundingBox();
      return !!p && !!a && p.y < a.y;
    },
  );
  const paths = [
    "",
    "opportunities",
    "keywords",
    "trends",
    "serp",
    "domain",
    "competitors",
    "backlinks",
    "content",
    "page",
    "clusters",
    "saved",
    "rank-tracking",
    "search-performance",
    "links",
    "cannibalization",
    "local-grid",
    "audit",
    "on-page",
    "report",
    "brand-lookup",
    "prompt-explorer",
    "local",
    "expired-domains",
    "settings",
  ];
  for (const path of paths) {
    try {
      await page.goto(`http://127.0.0.1:3101/p/${projectId}/${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await settle();
      const dismiss = page.getByRole("button", {
        name: "Dismiss",
        exact: true,
      });
      if (await dismiss.isVisible()) await dismiss.click();
      await capture(path || "overview");
    } catch (error) {
      result.screens.push({ name: path, error: String(error) });
    }
  }
  await page.goto(
    `http://127.0.0.1:3101/p/${projectId}/domain?domain=example.com&loc=2840&lang=en&tab=keywords`,
  );
  await settle();
  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await check(
    "Domain fixture search requires an explicit action and loads rows",
    async () => {
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const load = page.getByRole("button", { name: /Load keywords/i });
      await load.waitFor({ timeout: 30000 });
      await load.click();
      await page
        .getByRole("button", { name: "Sort by Volume", exact: true })
        .waitFor({ timeout: 30000 });
      return (await page.getByRole("row").count()) > 2;
    },
  );
  await capture("domain-fixture");
  await check(
    "Keyboard help on sortable headers stays in the viewport",
    async () => {
      const sort = page.getByRole("button", {
        name: "Sort by Volume",
        exact: true,
      });
      await sort.focus();
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip).toBeVisible();
      await expect(sort).toHaveAttribute("aria-describedby", /.+/);
      const box = await tooltip.boundingBox();
      if (!box || box.x < 0 || box.y < 0 || box.x + box.width > 1440)
        return false;
      await page.keyboard.press("Escape");
      await expect(tooltip).not.toBeVisible();
      return true;
    },
  );
  await check(
    "Sorting requests new consent and exposes aria-sort after the authorized load",
    async () => {
      const sort = page.getByRole("button", {
        name: "Sort by Volume",
        exact: true,
      });
      await sort.click();
      await expect(
        page.getByText("Results not loaded", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Export", exact: true }),
      ).not.toBeVisible();
      await page.getByRole("button", { name: /Load keywords/i }).click();
      await expect(sort).toBeVisible({ timeout: 30000 });
      await expect(sort.locator("xpath=ancestor::th")).toHaveAttribute(
        "aria-sort",
        /^(ascending|descending)$/,
      );
      return true;
    },
  );
  await capture("domain-sorted");
  await check(
    "CSV export downloads the displayed fixture rows, not a mislabeled Excel file",
    async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: /Excel/i })).toHaveCount(
        0,
      );
      const pendingDownload = page.waitForEvent("download");
      await page
        .getByRole("menuitem", { name: "Download CSV", exact: true })
        .click();
      const download = await pendingDownload;
      const stream = await download.createReadStream();
      if (!stream) return false;
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const content = Buffer.concat(chunks).toString("utf8");
      return (
        download.suggestedFilename() === "example.com-keywords.csv" &&
        content.includes("primary sample query") &&
        content.split("\n").length === 7
      );
    },
  );
  await check(
    "Clipboard denial produces useful feedback and leaves results usable",
    async () => {
      await page.evaluate(() => {
        Object.defineProperty(navigator.clipboard, "writeText", {
          configurable: true,
          value: () =>
            Promise.reject(
              new DOMException("UX test clipboard denial", "NotAllowedError"),
            ),
        });
      });
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "Copy data (JSON)", exact: true })
        .click();
      await expect(
        page.getByText(
          "Could not copy. Allow clipboard access or download CSV instead.",
          { exact: true },
        ),
      ).toBeVisible();
      return await page
        .getByRole("button", { name: "Sort by Volume", exact: true })
        .isVisible();
    },
  );
  await check(
    "Command search opens and supports keyboard navigation",
    async () => {
      await page.keyboard.press("Control+k");
      const input = page.getByRole("combobox", { name: "Search commands" });
      await input.waitFor();
      await expect(input).toBeFocused();
      await input.fill("Site Audit");
      await expect(input).toHaveValue("Site Audit");
      await expect(
        page.getByRole("option", { name: "Site Audit", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await input.press("Enter");
      await page.waitForURL(
        (url) => url.pathname.replace(/\/$/, "") === `/p/${projectId}/audit`,
        { waitUntil: "domcontentloaded" },
      );
      return page.url().includes(`/p/${projectId}/`);
    },
  );
  await check("Command menu Escape restores keyboard focus", async () => {
    const trigger = page
      .getByRole("button", { name: "Open command menu", exact: true })
      .first();
    await trigger.focus();
    await trigger.click();
    await page.getByRole("combobox", { name: "Search commands" }).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    return await trigger.evaluate((el) => el === document.activeElement);
  });
  await page.goto(
    `http://127.0.0.1:3101/p/${projectId}/domain?domain=example.com&loc=2840&lang=en&tab=keywords`,
  );
  await settle();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /Load keywords/i }).click();
  await expect(
    page.getByRole("button", { name: "Sort by Volume", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await settle();
    await capture(`domain-${width}`);
  }
  await check(
    "Mobile selection actions and their menu fit the viewport",
    async () => {
      await page
        .getByRole("checkbox", { name: "Select row", exact: true })
        .first()
        .check();
      const bar = page.getByRole("toolbar", {
        name: "Bulk actions",
        exact: true,
      });
      await expect(bar).toBeVisible();
      const box = await bar.boundingBox();
      if (
        !box ||
        box.x < 0 ||
        box.x + box.width > 390 ||
        box.y + box.height > 900
      )
        return false;
      await bar.getByRole("button", { name: "Export", exact: true }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      const menuBox = await menu.boundingBox();
      await capture("domain-mobile-selection");
      const fits =
        !!menuBox &&
        menuBox.x >= 0 &&
        menuBox.x + menuBox.width <= 390 &&
        menuBox.y >= 0;
      await page.keyboard.press("Escape");
      await bar
        .getByRole("button", { name: "Clear selection", exact: true })
        .click();
      await expect(bar).not.toBeVisible();
      return fits;
    },
  );
  await check("Mobile navigation is a modal dialog", async () => {
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    return await page
      .getByRole("dialog", { name: "Navigation", exact: true })
      .isVisible();
  });
  await check(
    "Mobile navigation contains forward and reverse keyboard focus",
    async () => {
      for (const key of ["Tab", "Shift+Tab"]) {
        for (let i = 0; i < 38; i++) {
          await page.keyboard.press(key);
          // Base UI uses a focus guard that forwards on the following frame.
          // Assert the settled focus after EVERY step, not an arbitrary instant.
          await expect
            .poll(() =>
              page.evaluate(
                () => !!document.activeElement?.closest('[role="dialog"]'),
              ),
            )
            .toBe(true);
        }
      }
      return true;
    },
  );
  await capture("mobile-navigation");
  await check("Escape closes navigation and restores its trigger", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    return (
      !(await page.getByRole("dialog", { name: "Navigation" }).isVisible()) &&
      (await page
        .getByRole("button", { name: "Toggle sidebar" })
        .evaluate((el) => el === document.activeElement))
    );
  });
  // Close the original non-dialog drawer to continue baseline inspection.
  const close = page.getByRole("button", {
    name: "Close sidebar",
    exact: true,
  });
  if (await close.last().isVisible()) await close.last().click();
  for (const path of [
    "",
    "opportunities",
    "keywords",
    "backlinks",
    "search-performance",
    "audit",
    "rank-tracking",
    "report",
  ]) {
    await page.goto(`http://127.0.0.1:3101/p/${projectId}/${path}`);
    await settle();
    if (await dismiss.isVisible()) await dismiss.click();
    await capture(`${path || "overview"}-390`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto(`http://127.0.0.1:3101/p/${projectId}/`);
  await settle();
  if (await dismiss.isVisible()) await dismiss.click();
  await check("Theme preference changes through the command menu", async () => {
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: "Search commands" });
    await expect(input).toBeFocused();
    await input.fill("Theme: Dark");
    await expect(
      page.getByRole("option", { name: "Theme: Dark", exact: true }),
    ).toBeVisible();
    await input.press("Enter");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "flyrocketseo-dark",
    );
    return true;
  });
  await capture("overview-dark-reduced-motion");
  await check(
    "Reduced motion keeps page content immediately visible",
    async () =>
      page.locator("h1").evaluate((el) => getComputedStyle(el).opacity === "1"),
  );
} catch (error) {
  result.fatal = String(error);
  await capture("fatal").catch(() => {});
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        screens: result.screens.length,
        checks: result.checks,
        fatal: result.fatal,
        consoleErrors: result.consoleErrors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
if (
  result.fatal ||
  result.consoleErrors.length > 0 ||
  result.screens.some((screen) => screen.error || screen.documentOverflow) ||
  result.checks.some((check) => !check.pass)
)
  process.exitCode = 1;
