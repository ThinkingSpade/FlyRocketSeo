import { expect, test, type Page } from "@playwright/test";

async function getProjectId(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/?]+)\/?(?:\?.*)?$/, {
    timeout: 30_000,
  });

  const match = page.url().match(/\/p\/([^/?]+)/);
  if (!match) throw new Error(`Could not read project id from ${page.url()}`);
  return match[1];
}

/**
 * Keyword research is a metered run: a `q` in the URL only prefills the form,
 * and nothing runs until Search is pressed (free here: keyword fixtures).
 * Searching in place, as a user opens another keyword tab, also keeps the
 * earlier tabs' results instead of reloading them away.
 */
async function searchKeyword(page: Page, keyword: string) {
  await page.getByPlaceholder("Enter keywords, one per line").fill(keyword);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(keyword, "i") }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Every keyword-research request the page sends. Server functions are
 * addressed by an encoded id, so the research call is recognised by its
 * payload; it is the only one carrying both of these fields.
 */
function watchResearchRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const body = request.postData() ?? "";
    if (
      request.url().includes("/_serverFn/") &&
      body.includes('"resultLimit"') &&
      body.includes('"keywords"')
    )
      requests.push(body);
  });
  return requests;
}

test.describe("Keyword Research navigation", () => {
  test("Back to Recent searches clears the active keyword tab query", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);

    await page.goto(
      `/p/${projectId}/keywords?q=keyword%20research&loc=2840&kLimit=150&mode=auto`,
    );
    await expect(
      page.getByRole("heading", { name: "Keyword Research", exact: true }),
    ).toBeVisible();
    await searchKeyword(page, "keyword research");
    const recentSearchesButton = page.locator(
      '[data-testid="keyword-research-recent-searches"]:visible',
    );
    await expect(recentSearchesButton).toBeVisible();

    await recentSearchesButton.click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe(null);
    await expect(
      page.getByRole("link", { name: "keyword research US" }),
    ).toBeVisible();
    await expect(recentSearchesButton).toBeHidden();
  });

  test("clicking keyword tabs keeps the clicked tab and URL in sync", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);

    await page.goto(
      `/p/${projectId}/keywords?q=keyword%20research&loc=2840&kLimit=150&mode=auto`,
    );
    const research = watchResearchRequests(page);
    await searchKeyword(page, "keyword research");
    await searchKeyword(page, "backlinks");
    expect(research).toHaveLength(2);

    await page.getByRole("tab", { name: /keyword research/i }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("keyword research");
    await expect(
      page.getByRole("row", { name: /keyword research/i }).first(),
    ).toBeVisible();

    await page.getByRole("tab", { name: /^backlinks/i }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("backlinks");
    await expect(
      page.getByRole("row", { name: /backlinks/i }).first(),
    ).toBeVisible();
    // Each tab showed its own result straight from the cache: switching
    // tabs must never send another (metered) research request.
    expect(research).toHaveLength(2);
  });

  test("a tab not run this session asks before running, and spends nothing until asked", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);
    await page.goto(`/p/${projectId}/keywords?loc=2840&kLimit=150&mode=auto`);
    await searchKeyword(page, "ai seo");

    // A reload keeps the tab (stored per project) but not its result.
    await page.goto(`/p/${projectId}/keywords?loc=2840&kLimit=150&mode=auto`);
    const research = watchResearchRequests(page);
    await searchKeyword(page, "backlinks");
    expect(research).toHaveLength(1);

    await page.getByRole("tab", { name: /^ai seo/i }).click();
    await expect(
      page.getByText("Results for “ai seo” are not loaded in this session."),
    ).toBeVisible();
    // Not another search's rows, and no request from the click.
    await expect(page.getByRole("row", { name: /backlinks/i })).toHaveCount(0);
    expect(research).toHaveLength(1);

    await page.getByRole("button", { name: "Run “ai seo”" }).click();
    await expect(
      page.getByRole("row", { name: /ai seo/i }).first(),
    ).toBeVisible({ timeout: 30_000 });
    expect(research).toHaveLength(2);
  });

  test("closing the active middle keyword tab removes it and selects the next tab", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);

    await page.goto(`/p/${projectId}/keywords?loc=2840&kLimit=150&mode=auto`);
    for (const keyword of ["ai seo", "backlinks", "open seo"]) {
      await searchKeyword(page, keyword);
    }

    await page.getByRole("tab", { name: /^backlinks/i }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("backlinks");

    const closeButton = page.getByRole("button", {
      name: "Close backlinks tab",
    });
    const closedTabId = await closeButton.getAttribute("data-search-tab-id");
    expect(closedTabId).toBeTruthy();

    await closeButton.click();

    // Closing the active tab selects its LEFT neighbour (useSearchTabs
    // closeTab: `tabs[index - 1] ?? tabs[index]`), the rule the Domain
    // Overview tab test also pins. Tabs append in the order searched.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("ai seo");
    await expect(page.getByRole("tab", { name: /^ai seo/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.locator(`[data-search-tab-id="${closedTabId}"]`),
    ).toHaveCount(0);
    // Scoped to the page: the sidebar's Browse/Chat switcher is a tablist too.
    await expect(page.getByRole("main").getByRole("tab")).toHaveCount(2);
  });
});
