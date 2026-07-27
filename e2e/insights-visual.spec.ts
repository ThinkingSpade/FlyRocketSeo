import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Visual smoke pass over every tab this branch touched (autofill chips +
 * NextStepsCard verdicts), at three viewports. No React test infra exists in
 * this repo, so this is the only thing standing between "the diff looks
 * right" and "the page actually renders" for this branch.
 *
 * Ground truth established by reading the controllers (DomainOverviewPage,
 * useKeywordResearchController/useKeywordResearchData) and then confirming
 * live: neither Domain Overview nor Keyword Research auto-fetch from a URL
 * param alone -- both only populate `runInput`/`authorizedResearchInput` from
 * an explicit form submit. So the two fixture-backed routes below actually
 * fill the field and click submit, same as a real user would, rather than
 * relying on query-string magic.
 */

const SCREENSHOT_DIR =
  "C:\\Users\\work\\AppData\\Local\\Temp\\claude\\C--Users-work-Documents-GitHub-FlyRocketSeo\\17335123-ccf2-483e-b77e-985351e41ac3\\scratchpad\\visual";
const RESULTS_JSON_PATH = path.join(SCREENSHOT_DIR, "results.json");

type ViewportName = "mobile" | "tablet" | "desktop";

// A tuple array rather than a record: iterating a record needs
// `Object.entries`, whose key type widens to `string` and would then need an
// `as` cast to narrow back — and oxlint forbids unsafe type assertions.
const VIEWPORTS: ReadonlyArray<
  readonly [ViewportName, { width: number; height: number }]
> = [
  ["mobile", { width: 390, height: 844 }],
  ["tablet", { width: 768, height: 1024 }],
  ["desktop", { width: 1280, height: 900 }],
];

type AlignmentResult = {
  applicable: boolean;
  checked: boolean;
  aligned: boolean | null;
  detail: string;
};

type RouteResult = {
  route: string;
  viewport: ViewportName;
  url: string;
  headingVisible: boolean;
  horizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  consoleErrors: string[];
  failedRequests: string[];
  alignment: AlignmentResult;
  screenshotPath: string;
  verdict: "pass" | "fail";
  failureReason: string | null;
};

const results: RouteResult[] = [];

async function getProjectId(page: Page): Promise<string> {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/]+)\/keywords(?:\?.*)?$/, {
    timeout: 30_000,
  });
  const match = page.url().match(/\/p\/([^/]+)\/keywords/);
  if (!match) throw new Error(`Could not read project id from ${page.url()}`);
  return match[1];
}

/** Every fresh navigation remounts the app shell, so this app-wide "add your
 *  DataForSEO key" modal reappears on every one of our 27 goto()s. It is
 *  unrelated to this branch; dismiss it so screenshots show the actual page
 *  instead of an overlay, and so it never blocks a form submit underneath. */
async function dismissSetupModalIfPresent(page: Page) {
  const dismissButton = page.getByRole("button", { name: "Dismiss" });
  await dismissButton
    .waitFor({ state: "visible", timeout: 1500 })
    .catch(() => {});
  if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click().catch(() => {});
  }
}

function attachDiagnostics(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} -- ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(`[pageerror] ${error.message}`);
  });
  return { consoleErrors, failedRequests };
}

async function gotoAndSettle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(600); // a beat for hydration
}

async function overflowCheck(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

async function getTopY(locator: Locator): Promise<number | null> {
  const box = await locator
    .first()
    .boundingBox()
    .catch(() => null);
  return box ? box.y : null;
}

type RouteConfig = {
  name: string;
  heading: string;
  url: (projectId: string) => string;
  /** Fixture-backed routes only: drives real data onto the page the way a
   *  user would (fill + submit), since neither route auto-fetches from a
   *  URL param alone. */
  loadRealData?: (page: Page) => Promise<void>;
  /** The five forms that gained SuggestionChips + the items-start fix.
   *  Domain/Backlinks/Competitors/Audit are all domain-or-URL-shaped
   *  prefills with no suggestion source (see resolvePrefill call sites),
   *  so they never render chips and keep their pre-existing layouts. */
  alignment?: {
    minBreakpoint: number;
    input: (page: Page) => Locator;
    others: (page: Page) => Locator[];
  };
};

const ROUTES: RouteConfig[] = [
  {
    name: "domain",
    heading: "Domain Overview",
    url: (id) => `/p/${id}/domain`,
    loadRealData: async (page) => {
      // A real, publicly-valid TLD -- unlike the existing spec's fixture
      // helper "primary.example" convention, this domain form's client-side
      // validator (isValidDomainHost) rejects reserved/example TLDs, so
      // typing+submitting "primary.example" here silently no-ops. Fixture
      // mode (getFixtureOverview) accepts any string and doesn't care which
      // valid-looking domain is actually submitted.
      const form = page.locator("form").first();
      await form.getByPlaceholder("Enter a domain").fill("example.com");
      await form.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page.getByRole("button", { name: /Filters/ })).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    name: "keywords",
    heading: "Keyword Research",
    url: (id) => `/p/${id}/keywords`,
    loadRealData: async (page) => {
      const form = page.locator("form").first();
      await form
        .getByPlaceholder("Enter keywords, one per line")
        .fill("keyword research");
      await form.getByRole("button", { name: "Search" }).click();
      const visibleRow = page
        .getByRole("row", { name: /keyword research/i })
        .and(page.locator(":visible"));
      await expect(visibleRow.first()).toBeVisible({ timeout: 30_000 });
    },
    alignment: {
      // KeywordResearchSearchBar uses `lg:flex-row lg:items-start` (lg =
      // 1024px), unlike the other four chip forms below which switch at `sm`
      // (640px) -- so this one only applies at desktop (1280), not tablet.
      minBreakpoint: 1024,
      // Unlike the other four forms, the keyword field's border/background
      // live on the *wrapping* <label> (a bordered px-4 py-3 box holding an
      // icon + the bare textarea), not on the textarea itself -- comparing
      // the textarea's own top (inset by the label's padding) against the
      // other controls' outer tops would be an apples-to-oranges ~13px
      // "misalignment" that isn't a real bug. Compare the label box's top
      // instead, matching what the other three controls' outer edges are.
      input: (page) =>
        page.locator("form label").filter({
          has: page.getByPlaceholder("Enter keywords, one per line"),
        }),
      others: (page) => [
        page.locator("form").getByRole("combobox").first(),
        page.locator("form").getByRole("button", { name: "Search" }),
      ],
    },
  },
  {
    name: "serp",
    heading: "SERP Overview",
    url: (id) => `/p/${id}/serp`,
    alignment: {
      minBreakpoint: 640,
      input: (page) =>
        page.locator("form").getByPlaceholder("office coffee service dallas"),
      others: (page) => [
        page.locator("form").getByRole("combobox"),
        page.locator("form").getByRole("button", { name: "Analyze" }),
      ],
    },
  },
  {
    name: "content",
    heading: "Content Optimizer",
    url: (id) => `/p/${id}/content`,
    alignment: {
      minBreakpoint: 640,
      input: (page) =>
        page.locator("form").getByPlaceholder("office coffee service dallas"),
      others: (page) => [
        page.locator("form").getByRole("combobox"),
        page.locator("form").getByRole("button", { name: "Build brief" }),
      ],
    },
  },
  {
    name: "trends",
    heading: "Keyword Trends",
    url: (id) => `/p/${id}/trends`,
    alignment: {
      minBreakpoint: 640,
      input: (page) =>
        page
          .locator("form")
          .getByPlaceholder("seo tools, keyword research, rank tracker"),
      // Trends has no location select -- just the input and Compare.
      others: (page) => [
        page.locator("form").getByRole("button", { name: "Compare" }),
      ],
    },
  },
  {
    name: "clusters",
    heading: "Topic Clusters",
    url: (id) => `/p/${id}/clusters`,
    alignment: {
      minBreakpoint: 640,
      input: (page) =>
        page.locator("form").getByPlaceholder("office vending machines"),
      others: (page) => [
        page.locator("form").getByRole("combobox"),
        page.locator("form").getByRole("button", { name: "Plan clusters" }),
      ],
    },
  },
  {
    name: "backlinks",
    heading: "Backlinks",
    url: (id) => `/p/${id}/backlinks`,
  },
  {
    name: "competitors",
    heading: "Competitor Insights",
    url: (id) => `/p/${id}/competitors`,
  },
  {
    name: "audit",
    heading: "Site Audit",
    url: (id) => `/p/${id}/audit`,
  },
];

test.beforeAll(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
});

test.afterAll(async () => {
  await writeFile(RESULTS_JSON_PATH, JSON.stringify(results, null, 2));
});

for (const [viewportName, viewportSize] of VIEWPORTS) {
  test.describe(`insights visual smoke @ ${viewportName}`, () => {
    test.use({ viewport: viewportSize });
    test.describe.configure({ timeout: 90_000 });

    for (const route of ROUTES) {
      test(`${route.name} (${viewportName})`, async ({ page }) => {
        const { consoleErrors, failedRequests } = attachDiagnostics(page);
        const failureReasons: string[] = [];

        const projectId = await getProjectId(page);
        const url = route.url(projectId);
        await gotoAndSettle(page, url);
        await dismissSetupModalIfPresent(page);

        if (route.loadRealData) {
          try {
            await route.loadRealData(page);
          } catch (error) {
            failureReasons.push(
              `loadRealData failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          await dismissSetupModalIfPresent(page);
          await page.waitForTimeout(400);
        }

        // 3. The page's own heading proves this rendered a real page, not a
        // blank/error shell.
        const heading = page.getByRole("heading", {
          name: new RegExp(
            route.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i",
          ),
          level: 1,
        });
        let headingVisible = false;
        try {
          await expect(heading).toBeVisible({ timeout: 15_000 });
          headingVisible = true;
        } catch {
          failureReasons.push(
            `heading "${route.heading}" never became visible`,
          );
        }

        // 4. No horizontal scroll -- the most likely regression from adding
        // chips into existing form rows, and exactly what a diff review can't
        // catch.
        const { scrollWidth, clientWidth } = await overflowCheck(page);
        const horizontalOverflow = scrollWidth > clientWidth + 1;
        if (horizontalOverflow) {
          failureReasons.push(
            `horizontal overflow: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`,
          );
        }

        // 5. Full-page screenshot.
        const screenshotFile = `${route.name}-${viewportName}.png`;
        const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFile);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // 6. Alignment: the form's location select / submit button must stay
        // top-aligned with the input (the items-end -> items-start fix), on
        // the five forms that gained SuggestionChips. Only applicable once
        // the viewport is at/above that form's row breakpoint -- below it,
        // the form is flex-col (stacked) and cross-axis alignment doesn't
        // apply.
        let alignment: AlignmentResult = {
          applicable: false,
          checked: false,
          aligned: null,
          detail:
            "this form has no SuggestionChips slot (domain/URL-shaped prefill) -- items-start alignment fix does not apply here",
        };
        if (route.alignment) {
          if (viewportSize.width >= route.alignment.minBreakpoint) {
            const inputTop = await getTopY(route.alignment.input(page));
            const otherLocators = route.alignment.others(page);
            const otherTops = await Promise.all(
              otherLocators.map((locator) => getTopY(locator)),
            );
            // `.some()` is not a type guard, so it cannot narrow away the
            // nulls. Filtering with a predicate does, which keeps the maths
            // below cast-free.
            const measuredTops = otherTops.filter(
              (top): top is number => top != null,
            );
            if (inputTop == null || measuredTops.length !== otherTops.length) {
              alignment = {
                applicable: true,
                checked: false,
                aligned: null,
                detail:
                  "could not measure one or more controls' bounding boxes (not visible/attached) -- not asserting, screenshot captured instead",
              };
            } else {
              const deltas = measuredTops.map((top) =>
                Math.abs(top - inputTop),
              );
              const maxDelta = Math.max(...deltas);
              const aligned = maxDelta <= 4;
              alignment = {
                applicable: true,
                checked: true,
                aligned,
                detail: `input top=${inputTop.toFixed(1)}px, other control tops=[${measuredTops
                  .map((top) => top.toFixed(1))
                  .join(
                    ", ",
                  )}]px, maxDelta=${maxDelta.toFixed(1)}px (tolerance 4px)`,
              };
              if (!aligned) {
                failureReasons.push(
                  `form controls not top-aligned: ${alignment.detail}`,
                );
              }
            }
          } else {
            alignment = {
              applicable: true,
              checked: false,
              aligned: null,
              detail: `viewport ${viewportSize.width}px is below this form's row breakpoint (${route.alignment.minBreakpoint}px) -- stacked layout, alignment not applicable`,
            };
          }
        }

        const verdict: "pass" | "fail" =
          failureReasons.length === 0 ? "pass" : "fail";

        results.push({
          route: route.name,
          viewport: viewportName,
          url,
          headingVisible,
          horizontalOverflow,
          scrollWidth,
          clientWidth,
          consoleErrors,
          failedRequests,
          alignment,
          screenshotPath,
          verdict,
          failureReason:
            failureReasons.length > 0 ? failureReasons.join("; ") : null,
        });

        // One combined hard assertion covering every category above
        // (heading, overflow, alignment, and a failed loadRealData) so the
        // JSON summary's verdict and Playwright's own pass/fail can never
        // disagree -- an earlier draft of this spec caught loadRealData
        // errors into failureReasons but never asserted on them, so the
        // Domain Overview test reported "passed" while its own JSON said
        // "fail". Asserting the whole array is empty closes that gap.
        expect(
          failureReasons,
          `${route.name}@${viewportName} should have no failures`,
        ).toEqual([]);
      });
    }
  });
}
