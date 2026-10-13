import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium, expect } from "@playwright/test";

// A real React + Kumo + application CSS component test, not an authenticated
// application or a provider integration. No requests leave the browser.
const root = fileURLToPath(new URL("../../", import.meta.url));
const out = path.resolve(
  process.env.UX_BULK_EVIDENCE_DIR || "ux-bulk-evidence",
);
const scratch = await mkdtemp(path.join(root, ".ux-bulk-review-"));
const result = {
  evidence:
    "Real bulk-action components; isolated test data; no live providers",
  checks: [],
  consoleErrors: [],
};
let browser;
try {
  await mkdir(out, { recursive: true });
  const entry = path.join(scratch, "entry.tsx");
  await writeFile(
    entry,
    `
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { TableBulkActionBar, TableBulkActionButton, TableBulkExportMenu } from "../src/client/components/table/TableBulkActionBar";
import "../src/client/styles/app.css";
function Fixture() {
  const [completed, setCompleted] = useState(0);
  return <main className="app-shell"><h1>Isolated bulk-action component check</h1>
    <p>Not the authenticated product. No live SEO data.</p>
    <output aria-label="Completed exports">{completed}</output>
    <TableBulkActionBar selectedCount={1} onClear={() => undefined} actions={
      <div className="flex items-center px-1.5">
        <TableBulkActionButton onClick={() => undefined}>Save keywords</TableBulkActionButton>
        <TableBulkExportMenu actions={[
          {label:"Export to Sheets",onClick:()=>setCompleted(n=>n+1)},
          {label:"Download CSV",onClick:()=>setCompleted(n=>n+1)},
        ]}/>
      </div>
    }/>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
`,
  );
  await build({
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    root,
    plugins: [react(), tailwindcss()],
    logLevel: "warn",
    build: {
      outDir: path.join(scratch, "dist"),
      lib: {
        entry,
        name: "BulkReview",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
      minify: false,
    },
  });
  const dist = path.join(scratch, "dist");
  const cssFiles = (await readdir(dist)).filter((file) =>
    file.endsWith(".css"),
  );
  const css = (
    await Promise.all(
      cssFiles.map((file) => readFile(path.join(dist, file), "utf8")),
    )
  ).join("\n");
  const js = await readFile(path.join(dist, "fixture.js"), "utf8");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE || undefined,
  });
  for (const [width, touch] of [
    [390, false],
    [390, true],
    [320, true],
    [1440, false],
  ]) {
    const name = `${width}-${touch ? "touch" : "mouse"}`;
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: touch,
    });
    await context.route("**/*", (route) => route.abort("blockedbyclient"));
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error) => result.consoleErrors.push(String(error)));
    try {
      await page.setContent(
        `<html data-theme="flyrocketseo-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`,
      );
      await page.addScriptTag({ content: js });
      const trigger = page.getByRole("button", { name: "Export", exact: true });
      await trigger.waitFor();
      for (const [index, label] of [
        "Download CSV",
        "Export to Sheets",
      ].entries()) {
        if (touch) await trigger.tap();
        else await trigger.click();
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await page.waitForTimeout(200);
        const box = await menu.boundingBox();
        if (
          !box ||
          box.x < 0 ||
          box.y < 0 ||
          box.x + box.width > width + 1 ||
          box.y + box.height > 901
        )
          throw new Error(`Menu outside viewport: ${JSON.stringify(box)}`);
        await page.screenshot({
          path: path.join(out, `${name}-${index}.png`),
          fullPage: true,
        });
        const item = page.getByRole("menuitem", { name: label, exact: true });
        // isVisible/boundingBox alone cannot detect a toolbar covering a portal.
        // A real click/tap must pass Playwright's hit-target check; never force it.
        if (touch) await item.tap({ timeout: 2000 });
        else await item.click({ timeout: 2000 });
        await expect(page.getByLabel("Completed exports")).toHaveText(
          String(index + 1),
        );
        await expect(menu).not.toBeVisible();
      }
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      result.checks.push({ name, pass: true });
    } catch (error) {
      result.checks.push({ name, pass: false, error: String(error) });
    } finally {
      await context.close();
    }
  }
} catch (error) {
  result.fatal = String(error);
} finally {
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(
    path.join(out, "results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
if (
  result.fatal ||
  result.consoleErrors.length ||
  result.checks.length !== 4 ||
  result.checks.some((check) => !check.pass)
)
  process.exitCode = 1;
