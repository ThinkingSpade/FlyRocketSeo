/** Execute production calculation/state modules in Chromium, without providers.
 * This is a browser computation harness, NOT the authenticated application.
 * Usage: node scripts/audit/verify-opportunities-browser.mjs
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ?? "@playwright/test",
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "docs/audits/browser-evidence");
mkdirSync(output, { recursive: true });
const modules = Object.fromEntries(
  ["opportunityModel", "technicalIssues", "technicalAuditState"].map((name) => [
    `./${name}`,
    ts.transpileModule(
      readFileSync(
        resolve(root, `src/client/features/opportunities/${name}.ts`),
        "utf8",
      ),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText,
  ]),
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 840 },
  });
  await page.route("**/*", (route) => route.abort());
  await page.setContent(
    "<main><h1>FlyRocketSEO browser computation checks</h1><p>Controlled fixtures — not the authenticated product, React renderer, router, or live SEO data.</p><button id='run'>Run checks</button><pre id='results' aria-live='polite'>Not run</pre></main>",
  );
  await page.addScriptTag({
    content: `
    const sources = ${JSON.stringify(modules)};
    const loaded = new Map();
    function require(name) {
      if (loaded.has(name)) return loaded.get(name);
      if (!Object.hasOwn(sources, name)) throw new Error('Unexpected import: ' + name);
      const module = { exports: {} };
      loaded.set(name, module.exports);
      new Function('require', 'module', 'exports', sources[name])(require, module, module.exports);
      return module.exports;
    }
    window.auditModules = {
      model: require('./opportunityModel'),
      technical: require('./technicalIssues'),
      state: require('./technicalAuditState'),
    };
  `,
  });
  await page.evaluate(() => {
    document.querySelector("#run").addEventListener("click", () => {
      const { model, technical, state } = window.auditModules;
      const base = {
        url: "https://fixture.invalid/page",
        statusCode: 200,
        title: "Title",
        metaDescription: "Description",
        h1Count: 1,
        wordCount: 900,
        imagesMissingAlt: 0,
      };
      const ok = { isError: false, isPending: false };
      const pending = { isError: false, isPending: true };
      const checks = [];
      const check = (name, actual, expected) =>
        checks.push({
          name,
          passed: JSON.stringify(actual) === JSON.stringify(expected),
          actual,
          expected,
        });
      check(
        "Disabled result query shows no-audit state",
        state.getTechnicalAuditState(ok, pending, undefined, undefined),
        "not-run",
      );
      check(
        "Empty completed crawl stays unknown",
        state.getTechnicalAuditState(ok, ok, "audit", []),
        "empty",
      );
      check(
        "One URL with several findings counts once",
        technical.summarizeTechnicalIssues([
          { ...base, title: "", metaDescription: "", h1Count: 0 },
        ]).affectedPages,
        1,
      );
      check(
        "404 does not fabricate missing metadata",
        model
          .buildTechnicalIssues([
            {
              ...base,
              statusCode: 404,
              title: null,
              metaDescription: null,
              h1Count: 0,
            },
          ])
          .map((item) => item.key),
        ["status"],
      );
      check(
        "Unknown fetch stays unverified",
        model
          .buildTechnicalIssues([{ ...base, statusCode: null, title: null }])
          .map((item) => item.key),
        ["unverified"],
      );
      check(
        "Redirect is not a confirmed HTTP failure",
        model
          .buildTechnicalIssues([{ ...base, statusCode: 301 }])
          .map((item) => item.key),
        ["redirect"],
      );
      check(
        "Missing GSC payload is unavailable",
        model.isSourceUnavailable(ok, undefined),
        true,
      );
      check(
        "Invalid positions do not create click scenarios",
        model.quickWinClicks(1000, NaN),
        0,
      );
      check(
        "Existing valid scenario remains stable",
        model.quickWinClicks(1000, 8),
        80,
      );
      window.auditResults = checks;
      document.querySelector("#results").textContent = checks
        .map((item) => `${item.passed ? "PASS" : "FAIL"}  ${item.name}`)
        .join("\n");
    });
  });
  await page.getByRole("button", { name: "Run checks" }).click();
  const checks = await page.evaluate(() => window.auditResults);
  assert.equal(checks.length, 9);
  assert.deepEqual(
    checks.filter((item) => !item.passed),
    [],
  );
  await page.screenshot({
    path: resolve(output, "computation-checks.png"),
    fullPage: true,
  });
  const result = {
    scope: "Isolated production computations; not full-app E2E",
    browser: browser.version(),
    checks,
  };
  writeFileSync(
    resolve(output, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
