import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Real application + router + local D1; existing test-only keyword/domain
// fixtures are enabled by the CI environment. No production secrets are used.
const out = process.env.UX_EVIDENCE_DIR || 'ux-evidence';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
  if (['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
  return route.abort('blockedbyclient');
});
const page = await context.newPage();
const result = { evidence: 'Isolated local application; fixtures are NOT live SEO findings', screens: [], checks: [], consoleErrors: [], failedRequests: [] };
page.on('pageerror', (error) => result.consoleErrors.push(String(error)));
page.on('response', (response) => { if (response.status() >= 400) result.failedRequests.push({ url: response.url(), status: response.status() }); });
const check = async (name, test) => {
  try { const details = await test(); result.checks.push({ name, pass: details !== false, details }); }
  catch (error) { result.checks.push({ name, pass: false, error: String(error) }); }
};
async function settle() {
  await page.waitForTimeout(1100);
  await page.locator('h1').first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1100);
}
async function stamp() {
  await page.evaluate(() => {
    let label = document.getElementById('ux-evidence-label');
    if (!label) { label = document.createElement('div'); label.id = 'ux-evidence-label'; document.body.append(label); }
    label.textContent = 'ISOLATED UX TEST · NOT LIVE SEO DATA';
    label.style.cssText = 'position:fixed;bottom:4px;right:4px;padding:3px 7px;background:#171717;color:white;font:10px system-ui;z-index:10000;pointer-events:none;border-radius:4px;';
  });
}
async function capture(name) {
  await stamp();
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const details = await page.evaluate(() => ({
    width: innerWidth,
    heading: document.querySelector('h1')?.textContent,
    text: document.body.innerText.slice(0, 14000),
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    overflowing: [...document.querySelectorAll('main *, [data-app-page] *')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 2 && getComputedStyle(el).position !== 'fixed';
    }).slice(0, 12).map(el => ({ tag: el.tagName, text: el.textContent.slice(0, 70) })),
  }));
  result.screens.push({ name, url: page.url(), ...details });
}
try {
  await page.goto('http://127.0.0.1:3101/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForURL(/\/p\/[^/]+/, { timeout: 120000 });
  await settle();
  const projectId = new URL(page.url()).pathname.split('/')[2];
  result.projectId = projectId;
  await check('Optional provider setup never blocks the workspace', async () => !(await page.getByRole('dialog', { name: 'One quick setup step' }).isVisible()));
  if (await page.getByRole('button', { name: 'Dismiss', exact: true }).isVisible()) await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await check('A main landmark and skip link exist', async () => (await page.getByRole('main').count()) === 1 && (await page.getByRole('link', { name: 'Skip to content' }).count()) === 1);
  const paths = ['', 'opportunities', 'keywords', 'trends', 'serp', 'domain', 'competitors', 'backlinks', 'content', 'page', 'clusters', 'saved', 'rank-tracking', 'search-performance', 'links', 'cannibalization', 'local-grid', 'audit', 'on-page', 'report', 'brand-lookup', 'prompt-explorer', 'local', 'expired-domains', 'settings'];
  for (const path of paths) {
    try {
      await page.goto(`http://127.0.0.1:3101/p/${projectId}/${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle();
      const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true });
      if (await dismiss.isVisible()) await dismiss.click();
      await capture(path || 'overview');
    } catch (error) { result.screens.push({ name: path, error: String(error) }); }
  }
  await page.goto(`http://127.0.0.1:3101/p/${projectId}/domain?domain=example.com&loc=2840&lang=en&tab=keywords`);
  await settle();
  const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await capture('domain-fixture');
  await check('Sortable columns expose aria-sort', async () => {
    const sort = page.getByRole('button', { name: /Sort by/ }).first();
    await sort.waitFor({ timeout: 20000 }); await sort.click();
    return await sort.locator('xpath=ancestor::th').getAttribute('aria-sort') === 'ascending' || await sort.locator('xpath=ancestor::th').getAttribute('aria-sort') === 'descending';
  });
  for (const width of [1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 }); await settle();
    await capture(`domain-${width}`);
  }
  await check('Mobile navigation is a modal dialog', async () => {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    return await page.getByRole('dialog', { name: 'Navigation', exact: true }).isVisible();
  });
  await check('Mobile navigation contains keyboard focus', async () => {
    for (let i = 0; i < 38; i++) await page.keyboard.press('Tab');
    return page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  });
  await capture('mobile-navigation');
  await check('Escape closes navigation and restores its trigger', async () => {
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    return !(await page.getByRole('dialog', { name: 'Navigation' }).isVisible()) && await page.getByRole('button', { name: 'Toggle sidebar' }).evaluate(el => el === document.activeElement);
  });
  const close = page.getByRole('button', { name: 'Close sidebar', exact: true });
  if (await close.first().isVisible()) await close.first().click();
  for (const path of ['', 'opportunities', 'keywords', 'backlinks', 'search-performance', 'audit', 'rank-tracking', 'report']) {
    await page.goto(`http://127.0.0.1:3101/p/${projectId}/${path}`); await settle();
    if (await dismiss.isVisible()) await dismiss.click();
    await capture(`${path || 'overview'}-390`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto(`http://127.0.0.1:3101/p/${projectId}/`); await settle();
  if (await dismiss.isVisible()) await dismiss.click();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'flyrocketseo-dark'));
  await capture('overview-dark-reduced-motion');
  await check('Reduced motion keeps page content immediately visible', async () => page.locator('h1').evaluate(el => getComputedStyle(el).opacity === '1'));
} catch (error) {
  result.fatal = String(error);
  await capture('fatal').catch(() => {});
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ screens: result.screens.length, checks: result.checks, fatal: result.fatal, consoleErrors: result.consoleErrors }, null, 2));
  await browser.close();
}
if (result.fatal || (process.env.UX_ASSERT === '1' && result.checks.some(check => !check.pass))) process.exitCode = 1;
