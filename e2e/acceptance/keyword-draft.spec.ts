import { expect, test } from "@playwright/test";
import { diagnostics, serverFunctionName, signIn } from "./helpers";
import { PROJECT_PAGING } from "./data";

test("a typed keyword draft survives the actual project market arriving late", async ({
  page,
}) => {
  const captured = diagnostics(page);
  await signIn(page);
  let releaseProjects!: () => void;
  const projectsReady = new Promise<void>((resolve) => {
    releaseProjects = resolve;
  });
  let paidRequests = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("researchKeywords_"))
      paidRequests += 1;
  });
  await page.route("**/_serverFn/**", async (route) => {
    if (serverFunctionName(route.request().url())?.startsWith("getProjects_")) {
      await projectsReady;
      await route.continue();
    } else await route.fallback();
  });
  try {
    await page.goto(`/p/${PROJECT_PAGING}/keywords`);
    const draft = page.getByPlaceholder("Enter keywords, one per line");
    await draft.fill("draft before market loaded");
    await expect(draft).toHaveValue("draft before market loaded");
    releaseProjects();
    await expect(
      page.getByRole("button", { name: "United Kingdom", exact: true }),
    ).toBeVisible();
    await expect(draft).toHaveValue("draft before market loaded");
    expect(paidRequests).toBe(0);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByRole("row", {
        name: /^Select row draft before market loaded tools/i,
      }),
    ).toBeVisible();
    expect(paidRequests).toBe(1);
    expect(captured.errors).toEqual([]);
    expect(captured.externalRequests).toEqual([]);
    expect(captured.failedServerResponses).toEqual([]);
  } finally {
    releaseProjects();
  }
});
