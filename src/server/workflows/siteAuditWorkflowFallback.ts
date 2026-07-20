import type { WorkflowStep } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { StepPageResult } from "@/server/lib/audit/types";
import {
  instantPageToStepPageResult,
  selectLabsSeedUrls,
} from "@/server/workflows/siteAuditFallbackMapping";

// When the free (homegrown Worker) crawler is blocked by anti-bot/firewall
// protection or defeated by client-side rendering, it returns zero pages. This
// fallback re-fetches the seed URLs through DataForSEO's OnPage `instant_pages`
// (its own crawler infrastructure + JS rendering), so bot-protected/competitor
// sites can still be audited. It is metered through the normal billing client
// (a no-op when Autumn billing is disabled; DataForSEO still charges per page,
// so callers must bound the URL count to maxPages).

// Small batches keep each step under the Worker CPU limit: parsing DataForSEO's
// (large, JS-rendered) instant_pages responses is CPU-heavy, and on the
// Cloudflare Free plan the fixed CPU ceiling is tight enough that ~8 responses
// in one step invocation exceeds it ("Worker exceeded CPU time limit"). 2/step
// stays comfortably under it. No-retry steps also ensure a step replay can never
// re-bill pages DataForSEO already charged for; a failed batch forfeits only its
// own pages and the loop moves on to the next batch.
const FALLBACK_BATCH_SIZE = 2;
const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
};

// On fully-locked sites even robots.txt/sitemap discovery is blocked, so the
// fallback would audit just the start URL. When the seed list is that thin,
// pull the domain's top organic pages from DataForSEO Labs (their own index —
// no site access needed) as extra seeds. US/en is fine for seed discovery: we
// only want page URLs, not localized metrics.
const LABS_SEED_THRESHOLD = 3;
const LABS_SEED_LOCATION_CODE = 2840;
const LABS_SEED_LANGUAGE_CODE = "en";

async function fetchLabsSeedUrls(
  step: WorkflowStep,
  params: {
    startUrl: string;
    billingCustomer: BillingCustomerContext;
    limit: number;
  },
): Promise<string[]> {
  try {
    const domain = new URL(params.startUrl).hostname.replace(/^www\./, "");
    return await step.do(
      "dataforseo-fallback-seed-pages",
      SINGLE_ATTEMPT_STEP_CONFIG,
      async () => {
        const client = createDataforseoClient(params.billingCustomer);
        const response = await client.domain.relevantPages({
          target: domain,
          locationCode: LABS_SEED_LOCATION_CODE,
          languageCode: LABS_SEED_LANGUAGE_CODE,
          limit: params.limit,
          orderBy: ["metrics.organic.etv,desc"],
        });
        return selectLabsSeedUrls(
          params.startUrl,
          response.items.map((item) => item.page_address),
          params.limit,
        );
      },
    );
  } catch (error) {
    // Seed enrichment is strictly additive — a Labs failure (no data for the
    // domain, API error) just means we audit the seeds we already have.
    console.warn("[audit-fallback] labs seed lookup failed; continuing", {
      error:
        error instanceof Error
          ? `${error.name}: ${error.message.slice(0, 300)}`
          : String(error).slice(0, 300),
    });
    return [];
  }
}

/**
 * Audit the given seed URLs via DataForSEO instant_pages (JS rendering on).
 * Per-URL failures are logged (sanitized) and skipped so one unreachable page
 * doesn't sink the batch. Returns [] if nothing could be fetched, leaving the
 * audit's existing "couldn't crawl" handling untouched.
 */
export async function runDataforseoFallbackCrawl(
  step: WorkflowStep,
  params: {
    seedUrls: string[];
    billingCustomer: BillingCustomerContext;
    maxPages: number;
  },
): Promise<StepPageResult[]> {
  let urls = Array.from(new Set(params.seedUrls)).slice(0, params.maxPages);
  if (urls.length === 0) return [];

  // Fully-locked site: discovery produced (nearly) nothing. Top up the seed
  // list from DataForSEO Labs so the audit covers the site's most important
  // pages instead of just the homepage.
  if (urls.length < LABS_SEED_THRESHOLD) {
    const labsSeeds = await fetchLabsSeedUrls(step, {
      startUrl: urls[0],
      billingCustomer: params.billingCustomer,
      limit: params.maxPages,
    });
    if (labsSeeds.length > 0) {
      urls = Array.from(new Set([...urls, ...labsSeeds])).slice(
        0,
        params.maxPages,
      );
      console.log("[audit-fallback] labs seeds added", {
        labsSeedCount: labsSeeds.length,
        totalSeeds: urls.length,
      });
    }
  }

  console.log("[audit-fallback] free crawl got 0 pages; trying DataForSEO", {
    seedCount: urls.length,
    maxPages: params.maxPages,
  });

  const pages: StepPageResult[] = [];
  let batchIndex = 0;
  for (let i = 0; i < urls.length; i += FALLBACK_BATCH_SIZE) {
    const batch = urls.slice(i, i + FALLBACK_BATCH_SIZE);
    batchIndex += 1;
    try {
      const batchPages = await step.do(
        `dataforseo-fallback-batch-${batchIndex}`,
        SINGLE_ATTEMPT_STEP_CONFIG,
        async () => {
          const client = createDataforseoClient(params.billingCustomer);
          const results: StepPageResult[] = [];
          for (const url of batch) {
            try {
              const item = await client.onPage.instantPage({
                url,
                // Render JS: we only reach this fallback because a plain fetch
                // failed, commonly a client-rendered or challenged page.
                enableJavascript: true,
              });
              if (item) {
                results.push(instantPageToStepPageResult(url, item));
              } else {
                console.warn("[audit-fallback] instant_pages returned no item", {
                  url,
                });
              }
            } catch (error) {
              // Sanitized: log the error class/message, never credentials.
              console.warn("[audit-fallback] instant_pages failed", {
                url,
                error:
                  error instanceof Error
                    ? `${error.name}: ${error.message.slice(0, 300)}`
                    : String(error).slice(0, 300),
              });
            }
          }
          return results;
        },
      );
      pages.push(...batchPages);
    } catch (error) {
      console.warn("[audit-fallback] batch step failed; continuing", {
        batchIndex,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message.slice(0, 300)}`
            : String(error).slice(0, 300),
      });
    }
  }

  console.log("[audit-fallback] done", {
    pagesRecovered: pages.length,
    seedCount: urls.length,
  });
  return pages;
}
