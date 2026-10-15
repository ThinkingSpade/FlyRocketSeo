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

test.describe("Keyword Research navigation", () => {
  test("Back to Recent searches clears the active keyword tab query", async ({
    page,
  }) => {
    // KNOWN APP BUG (found 2026-10-15): results follow the last *submitted*
    // search (useKeywordResearchData builds its request from the authorized
    // input only), not the URL. So "Recent searches" clears `q`
    // but keeps showing the old results instead of the recent-search list.
    // Remove this line when that is fixed; Playwright flags it if it passes.
    test.fail();
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
    // KNOWN APP BUG (found 2026-10-15): results follow the last *submitted*
    // search (useKeywordResearchData builds its request from the authorized
    // input only), not the URL. So clicking an earlier tab updates the
    // tab and `q` while the table still shows the last search's rows.
    // Remove this line when that is fixed; Playwright flags it if it passes.
    test.fail();
    const projectId = await getProjectId(page);

    await page.goto(
      `/p/${projectId}/keywords?q=keyword%20research&loc=2840&kLimit=150&mode=auto`,
    );
    await searchKeyword(page, "keyword research");
    await searchKeyword(page, "backlinks");

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
