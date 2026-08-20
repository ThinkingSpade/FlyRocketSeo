import { expect, test } from "@playwright/test";

/**
 * The audit results expiry card, rendered from a run whose registration was
 * already looked up.
 *
 * Requires a completed audit carrying `domain_expiration_json`. Seed one into
 * local D1 (free — no crawl, no credits):
 *
 *   npx wrangler d1 execute open-seo --local --command "INSERT INTO audits
 *     (id, project_id, started_by_user_id, start_url, status, pages_crawled,
 *      pages_total, completed_at, domain_expiration_json)
 *     VALUES ('seed-audit-expiry', '<projectId>', '<userId>',
 *      'https://deliotx.com', 'completed', 10, 10, '2026-08-20T00:00:00Z',
 *      '{\"domain\":\"deliotx.com\",\"expirationDate\":\"2028-02-22T19:23:16Z\",
 *        \"createdDate\":\"2024-02-22T19:23:16Z\",\"lastUpdatedDate\":null}');"
 *
 * The point of the test is that a stored run renders with ZERO requests: the
 * day counts come from the stored ABSOLUTE dates against the current clock, so
 * re-opening a months-old audit costs nothing and still states today's truth.
 */
const SEEDED_AUDIT_ID = "seed-audit-expiry";
const SEEDED_PROJECT_ID = "464954b0-255e-441a-91ce-fbe2b5baebf3";

function serverFnTarget(url: string): string {
  const segment = url.split("/_serverFn/")[1];
  if (!segment) return "";
  try {
    return atob(segment.split("?")[0] ?? "");
  } catch {
    return "";
  }
}

test.describe("Audit domain-expiry card", () => {
  // Depends on the seeded row above, which CI does not have. Opt in locally
  // with AUDIT_EXPIRY_SEEDED=1 after running the insert.
  test.skip(
    process.env.AUDIT_EXPIRY_SEEDED !== "1",
    "Seed the audit row (see header) and set AUDIT_EXPIRY_SEEDED=1.",
  );

  test("renders stored registration without any metered request", async ({
    page,
  }) => {
    const expiryCalls: string[] = [];
    page.on("request", (request) => {
      const target = serverFnTarget(request.url());
      if (target.includes("auditDomainExpiry")) expiryCalls.push(request.url());
    });

    await page.goto("/");
    await page.waitForURL(/\/p\/([^/]+)\/keywords(?:\?.*)?$/, {
      timeout: 30_000,
    });
    const match = page.url().match(/\/p\/([^/]+)\/keywords/);
    if (!match) throw new Error(`Could not read project id from ${page.url()}`);

    // Pin the project explicitly: the seeded audit belongs to one project, and
    // the landing redirect follows whichever project was last selected.
    await page.goto(`/p/${SEEDED_PROJECT_ID}/audit?auditId=${SEEDED_AUDIT_ID}`);

    const card = page.getByTestId("audit-domain-expiry");
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Derived from the stored absolute dates, not stored themselves.
    await expect(card).toContainText("Domain registration");
    await expect(card).toContainText("Expires");
    await expect(card).toContainText("Days left");
    await expect(card).toContainText("Healthy");
    // Registered 2024-02-22, so it is comfortably over a year old.
    await expect(card).toContainText(/\d+(\.\d+)? yrs/);

    expect(
      expiryCalls,
      "a stored registration must render without paying again",
    ).toHaveLength(0);
  });
});
