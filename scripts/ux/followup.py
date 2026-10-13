from pathlib import Path

root = Path('.')
def replace(path, old, new):
    p = root / path
    text = p.read_text()
    if old not in text:
        raise RuntimeError('Expected source not found: ' + path)
    p.write_text(text.replace(old, new))
def add(path, text):
    p = root / path
    if p.exists():
        raise RuntimeError('Refusing to overwrite: ' + path)
    p.write_text(text)

replace('src/client/features/home/AuthenticatedHome.tsx', 'to: "/p/$projectId/keywords",', 'to: "/p/$projectId",')
table = 'src/client/features/domain/components/DomainKeywordsTable.tsx'
replace(table, 'label="Volume"\n', 'label="Volume"\n            helpText="Estimated average monthly searches in the selected market, not visits to this website."\n')
replace(table, 'label="Traffic"\n', 'label="Traffic"\n            helpText="Estimated organic visits for this keyword from the research provider. This is not measured Search Console traffic."\n')
replace(table, 'label="Rank"\n', 'label="Rank"\n            helpText="The domain’s position in the provider’s captured search results. Lower is better; a missing value is unknown."\n')

add('src/client/features/domain/components/domainPaginationRange.ts', '''const format = (value: number) => value.toLocaleString("en-US");

/** Describe actual returned records without inventing an unknown total. */
export function domainPaginationRange(
  page: number,
  pageSize: number,
  total: number | null,
  rows: number,
): string {
  if (rows === 0) {
    if (total === 0) return "0 results";
    return `0 results on this page · ${total === null ? "total unavailable" : `${format(total)} total`}`;
  }
  const start = (page - 1) * pageSize + 1;
  const end = start + rows - 1;
  const suffix = total !== null && total >= end ? ` of ${format(total)}` : " · total unavailable";
  return `${format(start)}–${format(end)}${suffix}`;
}
''')
add('src/client/features/domain/components/domainPaginationRange.test.ts', '''import { describe, expect, it } from "vitest";
import { domainPaginationRange } from "./domainPaginationRange";

describe("pagination describes returned rows, not an assumed full page", () => {
  it("reports a partial page when the provider total is unknown", () => {
    expect(domainPaginationRange(2, 50, null, 7)).toBe("51–57 · total unavailable");
  });
  it("does not invent a range for an empty page", () => {
    expect(domainPaginationRange(2, 50, null, 0)).toBe("0 results on this page · total unavailable");
  });
  it("uses the returned row count even when a larger total is known", () => {
    expect(domainPaginationRange(1, 50, 100, 7)).toBe("1–7 of 100");
  });
  it("keeps an out-of-range page readable", () => {
    expect(domainPaginationRange(3, 50, 60, 0)).toBe("0 results on this page · 60 total");
  });
  it("distinguishes a genuinely empty dataset", () => {
    expect(domainPaginationRange(1, 50, 0, 0)).toBe("0 results");
  });
});
''')
pagination = 'src/client/features/domain/components/DomainKeywordsPagination.tsx'
p = root / pagination
text = p.read_text()
start = text.index('function formatRange(')
end = text.index('export function DomainKeywordsPagination', start)
text = text[:start] + text[end:]
text = 'import { domainPaginationRange } from "./domainPaginationRange";\n' + text
text = text.replace('type Props = {\n', 'type Props = {\n  rowCount: number;\n')
text = text.replace('export function DomainKeywordsPagination({\n', 'export function DomainKeywordsPagination({\n  rowCount,\n')
text = text.replace('formatRange(page, pageSize, totalCount)', 'domainPaginationRange(page, pageSize, totalCount, rowCount)')
p.write_text(text)
for leaf in ['KeywordsTab.tsx', 'PagesTab.tsx']:
    replace('src/client/features/domain/components/' + leaf, '<DomainKeywordsPagination\n', '<DomainKeywordsPagination\n            rowCount={rows.length}\n')

bulk = 'src/client/components/table/TableBulkActionBar.tsx'
replace(bulk, 'fixed inset-x-0 bottom-6', 'fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))]')
replace(bulk, 'flex items-stretch overflow-visible', 'flex max-w-full flex-wrap items-stretch overflow-visible')
replace(bulk, 'className="-ml-1 rounded p-1', 'className="app-touch-target -ml-1 rounded p-1')
replace(bulk, 'className={`inline-flex items-center gap-1.5', 'className={`app-touch-target inline-flex items-center gap-1.5')
replace(bulk, 'className="inline-flex items-center gap-1.5 rounded-md px-2.5', 'className="app-touch-target inline-flex items-center gap-1.5 rounded-md px-2.5')
replace(bulk, '<span className="font-medium tabular-nums">{selectedCount}</span>', '<span role="status" aria-live="polite" aria-atomic="true" className="font-medium tabular-nums">{selectedCount}</span>')
for path, size in [('src/client/features/opportunities/OpportunitiesPage.tsx', '6'), ('src/client/features/onpage/OnPageFixesPage.tsx', '8')]:
    replace(path, 'className="rounded-lg border border-dashed border-base-300 p-' + size + ' text-center"', 'className="flex flex-col items-center rounded-lg border border-dashed border-base-300 p-' + size + ' text-center"')
for path in ['src/client/features/link-insights/CannibalizationPage.tsx', 'src/client/features/link-insights/LinkOpportunitiesPage.tsx', 'src/client/features/local-seo/LocalProjectContext.tsx']:
    replace(path, 'GSC Insights', 'Search Performance')

replace('src/client/features/dashboard/ProjectDashboardPage.tsx', '''      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <NextActionsCard projectId={projectId} />
        <div className="min-w-0 space-y-4">''', '''      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <NextActionsCard projectId={projectId} />
          <RankChangesCard projectId={projectId} />
        </div>
        <div className="min-w-0 space-y-4">''')
replace('src/client/features/dashboard/ProjectDashboardPage.tsx', '''      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <RankChangesCard projectId={projectId} />
        <ProjectKeywordsCard projectId={projectId} />
      </div>''', '      <ProjectKeywordsCard projectId={projectId} />')

add('src/client/features/home/AuthenticatedHome.test.ts', '''import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  remembered: null as string | null,
  effects: [] as Array<() => void>,
  navigate: vi.fn(),
  clear: vi.fn<() => void>(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  // Explicit route effects are component contracts, not authenticated E2E.
  useEffect: (effect: () => void) => state.effects.push(effect),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [{ id: "project-a" }, { id: "project-b" }], error: null, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/serverFunctions/projects", () => ({ getProjects: vi.fn() }));
vi.mock("@/client/lib/active-project", () => ({
  getLastProjectId: () => state.remembered,
  clearLastProjectId: () => state.clear(),
}));
import { AuthenticatedHome } from "./AuthenticatedHome";

beforeEach(() => { state.effects = []; state.remembered = null; vi.clearAllMocks(); });
function enterHome() {
  renderToStaticMarkup(createElement(AuthenticatedHome));
  state.effects.forEach((effect) => effect());
}
describe("root entry leads to the selected site's command center", () => {
  it("opens Overview, not a paid research workflow, for a new visitor", () => {
    enterHome();
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/p/$projectId", params: { projectId: "project-a" } });
  });
  it("preserves a remembered project that belongs to the current organization", () => {
    state.remembered = "project-b";
    enterHome();
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/p/$projectId", params: { projectId: "project-b" } });
    expect(state.clear).not.toHaveBeenCalled();
  });
  it("clears an unrecognized project instead of navigating to it", () => {
    state.remembered = "foreign-project";
    enterHome();
    expect(state.clear).toHaveBeenCalledOnce();
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/p/$projectId", params: { projectId: "project-a" } });
  });
});
''')

script = 'scripts/ux/browser-review.mjs'
replace(script, 'await page.waitForURL(/\\/audit\\/?$/, { waitUntil: "domcontentloaded" });', 'await page.waitForURL((url) => url.pathname.replace(/\\/$/, "") === `/p/${projectId}/audit`, { waitUntil: "domcontentloaded" });')
replace(script, '  await capture("domain-sorted");', r'''  await capture("domain-sorted");
  await check("CSV export downloads the displayed fixture rows, not a mislabeled Excel file", async () => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /Excel/i })).toHaveCount(0);
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download CSV", exact: true }).click();
    const download = await pendingDownload;
    const stream = await download.createReadStream();
    if (!stream) return false;
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const content = Buffer.concat(chunks).toString("utf8");
    return download.suggestedFilename() === "example.com-keywords.csv" && content.includes("primary sample query") && content.split("\n").length === 7;
  });
  await check("Clipboard denial produces useful feedback and leaves results usable", async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: () => Promise.reject(new DOMException("UX test clipboard denial", "NotAllowedError")) });
    });
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("menuitem", { name: "Copy data (JSON)", exact: true }).click();
    await expect(page.getByText("Could not copy. Allow clipboard access or download CSV instead.", { exact: true })).toBeVisible();
    return await page.getByRole("button", { name: "Sort by Volume", exact: true }).isVisible();
  });''')
replace(script, '  await check("Mobile navigation is a modal dialog", async () => {', '''  await check("Mobile selection actions and their menu fit the viewport", async () => {
    await page.getByRole("checkbox", { name: "Select row", exact: true }).first().check();
    const bar = page.getByRole("toolbar", { name: "Bulk actions", exact: true });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    if (!box || box.x < 0 || box.x + box.width > 390 || box.y + box.height > 900) return false;
    await bar.getByRole("button", { name: "Export", exact: true }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    await capture("domain-mobile-selection");
    const fits = !!menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= 390 && menuBox.y >= 0;
    await page.keyboard.press("Escape");
    await bar.getByRole("button", { name: "Clear selection", exact: true }).click();
    await expect(bar).not.toBeVisible();
    return fits;
  });
  await check("Mobile navigation is a modal dialog", async () => {''')
