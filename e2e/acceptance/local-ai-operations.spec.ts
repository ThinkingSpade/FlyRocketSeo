import { expect, test } from "@playwright/test";
import {
  diagnostics,
  serverFunctionName,
  signIn,
  submitWithPendingCheck,
} from "./helpers";
import { ORG_A, PROJECT_A2, PROJECT_OPERATIONS } from "./data";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { z } from "zod";
import { citationTrackerResultSchema } from "@/types/schemas/citations";

// Decode the actual TanStack RPC protocol with its installed dependency.
const startRequire = createRequire(
  import.meta.resolve("@tanstack/react-start"),
);
const { fromCrossJSON } = z
  .object({
    fromCrossJSON: z.function({
      input: [z.unknown(), z.object({})],
      output: z.unknown(),
    }),
  })
  .parse(
    createRequire(
      startRequire.resolve("@tanstack/start-client-core/package.json"),
    )("seroval"),
  );
function citationObservation(payload: unknown) {
  return z
    .object({ result: citationTrackerResultSchema })
    .parse(fromCrossJSON(payload, {})).result;
}

test("Local SEO looks up a scoped profile, collects an owned review task and restores its receipt after reload", async ({
  page,
}) => {
  const captured = diagnostics(page);
  const collection = { url: "", body: "" };
  let posts = 0;
  let citations = 0;
  page.on("request", (request) => {
    const name = serverFunctionName(request.url());
    if (name?.startsWith("startBusinessReviews_")) posts += 1;
    if (name?.startsWith("getCitationReport_")) citations += 1;
    if (name?.startsWith("getBusinessReviewsResult_")) {
      collection.url = request.url();
      collection.body = request.postData() ?? "";
    }
  });
  await signIn(page);
  let releasePrefill!: () => void;
  let prefillsReady = new Promise<void>((resolve) => {
    releasePrefill = resolve;
  });
  await page.route("**/_serverFn/**", async (route) => {
    const name = serverFunctionName(route.request().url());
    if (
      ["getProjects_", "getGscConnection_", "getCachedBusinessContext_"].some(
        (prefix) => name?.startsWith(prefix),
      )
    ) {
      await prefillsReady;
    }
    await route.fallback();
  });
  await page.goto(`/p/${PROJECT_OPERATIONS}/local`);
  const businessInput = page.getByPlaceholder("Joe's Pizza Brooklyn");
  try {
    await businessInput.fill("Acceptance Rocket Business");
    releasePrefill();
    await page.waitForLoadState("networkidle");
    await expect(businessInput).toHaveValue("Acceptance Rocket Business");
    prefillsReady = new Promise<void>((resolve) => {
      releasePrefill = resolve;
    });
    await page.reload();
    await businessInput.fill("Acceptance Rocket Business");
    await businessInput.clear();
    releasePrefill();
    await page.waitForLoadState("networkidle");
    await expect(businessInput).toHaveValue("");
  } finally {
    releasePrefill();
  }
  await page.waitForLoadState("networkidle");
  await page
    .getByPlaceholder("Joe's Pizza Brooklyn")
    .fill("Acceptance Rocket Business");
  await page.getByRole("button", { name: /^Look up/ }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Acceptance Rocket Business");
  await expect(
    page.getByText("Acceptance Rocket Business", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/DataForSEO Business Data · Captured/),
  ).toBeVisible();
  expect(posts).toBe(0);
  expect(citations).toBe(0);
  await submitWithPendingCheck(
    page,
    "getCitationReport_",
    page.getByRole("button", { name: "Check citations", exact: true }),
  );
  await expect(
    page.getByText(
      /Only 2 organic results.*too few to judge citation coverage/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^Not found in this search/ }),
  ).toHaveCount(0);
  expect(citations).toBe(1);
  await page.getByRole("button", { name: /^Fetch reviews/ }).click();
  await expect(
    page
      .getByText("Acceptance review from isolated fixture", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Newest 30 requested reviews; this is a sampled crawl/),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Only 2 organic results.*too few to judge citation coverage/,
    ),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect(citations).toBe(1);
  expect(collection.url).not.toBe("");
  const otherProject = await page.request.post(collection.url, {
    data: collection.body.replaceAll(PROJECT_OPERATIONS, PROJECT_A2),
    headers: {
      "Content-Type": "application/json",
      "x-tsr-serverFn": "true",
      Origin: "http://localhost:3102",
    },
  });
  expect(await otherProject.text()).toContain("FORBIDDEN");
  await page.reload();
  await expect(
    page
      .getByText("Acceptance review from isolated fixture", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Only 2 organic results.*too few to judge citation coverage/,
    ),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect(citations).toBe(1);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Local SEO saves and restores provider no-results citation observations without another discovery", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getCitationReport_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/local`);
  await page.waitForLoadState("networkidle");
  await page
    .getByPlaceholder("Joe's Pizza Brooklyn")
    .fill("Empty Citation Fixture Business");
  await page.getByRole("button", { name: /^Look up/ }).click();
  await expect(
    page.getByText("Empty Citation Fixture Business", { exact: true }).first(),
  ).toBeVisible();
  expect(calls).toBe(0);
  const citationResponse = () =>
    page.waitForResponse(
      (response) =>
        serverFunctionName(response.url())?.startsWith("getCitationReport_") ===
        true,
    );
  const firstResponse = citationResponse();
  await submitWithPendingCheck(
    page,
    "getCitationReport_",
    page.getByRole("button", { name: "Check citations", exact: true }),
  );
  const first = await firstResponse;
  expect(first.ok()).toBe(true);
  const firstObservation = citationObservation(await first.json());
  expect(firstObservation.contractVersion).toBe(2);
  expect(firstObservation.source).toBe("DataForSEO Google Organic SERP");
  expect(firstObservation.scope).toMatchObject({
    organizationId: ORG_A,
    projectId: PROJECT_OPERATIONS,
    businessName: "Empty Citation Fixture Business",
    locationCode: 2840,
    languageCode: "en",
    query: firstObservation.query,
    city: firstObservation.city,
    phone: firstObservation.phone,
  });
  expect(firstObservation.query).toContain("Empty Citation Fixture Business");
  expect(firstObservation.results).toEqual([]);
  const originalCapture = firstObservation.fetchedAt;
  expect(originalCapture).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  const emptyVerdict = page.getByText(
    /Only 0 organic results.*too few to judge citation coverage/,
  );
  await expect(emptyVerdict).toBeVisible();
  const sourceFooter = page.getByText(
    /DataForSEO Google Organic SERP · Captured/,
  );
  await expect(sourceFooter).toContainText("US · en · Desktop");
  await expect(sourceFooter).toContainText(`Search: ${firstObservation.query}`);
  const originalFooter = await sourceFooter.textContent();
  expect(originalFooter).not.toContain("unavailable");
  const renderedCapture = await page.evaluate(
    (value) => new Date(value).toLocaleString(),
    originalCapture,
  );
  await expect(sourceFooter).toContainText(`Captured ${renderedCapture}`);
  expect(calls).toBe(1);
  await expect(
    page.getByRole("heading", { name: /^Not found in this search/ }),
  ).toHaveCount(0);
  const cachedResponse = citationResponse();
  await submitWithPendingCheck(
    page,
    "getCitationReport_",
    page.getByRole("button", { name: "Check citations", exact: true }),
  );
  const cached = await cachedResponse;
  expect(cached.ok()).toBe(true);
  expect(citationObservation(await cached.json())).toEqual(firstObservation);
  await expect(sourceFooter).toHaveText(originalFooter ?? "");
  expect(calls).toBe(2);
  await page.reload();
  await expect(emptyVerdict).toBeVisible();
  await expect(sourceFooter).toHaveText(originalFooter ?? "");
  await expect(page.getByText(/Showing your last run for/)).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(calls).toBe(2);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Local Rank Grid checks nine actual service cells and reloads their original cache without spending", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let checks = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("getLocalGridCell_"))
      checks += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/local-grid`);
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("vending machines").fill("operation grid rocket");
  await page
    .getByPlaceholder("75201 · Plano, TX · any address")
    .fill("Acceptance City");
  await page.getByRole("combobox").last().selectOption("3");
  expect(checks).toBe(0);
  await page.getByRole("button", { name: "Scan grid", exact: true }).click();
  await expect(
    page.getByText(/9 successful pins of 9 requested/),
  ).toBeVisible();
  await expect(page.getByText(/visible at 9\/9 pins/)).toBeVisible();
  expect(checks).toBe(9);
  const originalCaptures = await page
    .getByText(/Original cell captures:/)
    .textContent();
  await page.reload();
  await expect(page.getByText(/9 successful pins restored/)).toBeVisible();
  expect(await page.getByText(/Original cell captures:/).textContent()).toBe(
    originalCaptures,
  );
  expect(checks).toBe(9);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("AI Visibility runs real provider adapters while history and reload only prefill inputs", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("lookupBrand_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/brand-lookup`);
  await page.waitForLoadState("networkidle");
  await page
    .getByPlaceholder("Enter a brand name or domain")
    .fill("operation.example");
  expect(calls).toBe(0);
  await submitWithPendingCheck(
    page,
    "lookupBrand_",
    page.getByRole("button", { name: "Look up", exact: true }),
    page.getByRole("button", { name: /Look up|Looking up/ }),
  );
  await expect(
    page.getByText("Acceptance rocket question", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/DataForSEO AI Optimization/).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "CSV", exact: true }).click();
  const csv = await readFile(await (await downloadPromise).path(), "utf8");
  expect(csv).toContain("Acceptance rocket question");
  expect(csv).toContain("DataForSEO AI Optimization");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByPlaceholder("pricing, reviews").fill("absent-fixture");
  await expect(
    page.getByRole("row", { name: /Acceptance rocket question/ }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
  await page.reload();
  await expect(
    page.getByPlaceholder("Enter a brand name or domain"),
  ).toHaveValue("operation.example");
  await expect(
    page.getByText("Acceptance rocket question", { exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});

test("Prompt Explorer explicitly runs selected models and citations; reload preserves inputs without new paid calls", async ({
  page,
}) => {
  const captured = diagnostics(page);
  let calls = 0;
  page.on("request", (request) => {
    if (serverFunctionName(request.url())?.startsWith("explorePrompt_"))
      calls += 1;
  });
  await signIn(page);
  await page.goto(`/p/${PROJECT_OPERATIONS}/prompt-explorer`);
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("textbox", { name: "Prompt", exact: true })
    .fill("Acceptance operation rocket question");
  for (const name of ["Claude", "Gemini", "Perplexity"])
    await page.getByRole("checkbox", { name, exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "ChatGPT", exact: true }).check();
  await page
    .getByRole("checkbox", {
      name: "Allow web search (more current answers)",
      exact: true,
    })
    .check();
  expect(calls).toBe(0);
  await submitWithPendingCheck(
    page,
    "explorePrompt_",
    page.getByRole("button", { name: /^Run/ }),
  );
  await expect(
    page
      .getByText("Acceptance fixture answer about operation rockets.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.locator('a[href="https://operation.example/guide"]').first(),
  ).toHaveAttribute("href", "https://operation.example/guide");
  expect(calls).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Prompt", exact: true }),
  ).toHaveValue("Acceptance operation rocket question");
  expect(calls).toBe(1);
  await expect(
    page.getByText("Acceptance fixture answer about operation rockets.", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(captured.errors).toEqual([]);
  expect(captured.externalRequests).toEqual([]);
  expect(captured.failedServerResponses).toEqual([]);
});
