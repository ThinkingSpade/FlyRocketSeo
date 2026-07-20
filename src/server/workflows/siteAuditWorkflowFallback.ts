import type { WorkflowStep } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { StepPageResult } from "@/server/lib/audit/types";
import { instantPageToStepPageResult } from "@/server/workflows/siteAuditFallbackMapping";

// When the free (homegrown Worker) crawler is blocked by anti-bot/firewall
// protection or defeated by client-side rendering, it returns zero pages. This
// fallback re-fetches the seed URLs through DataForSEO's OnPage `instant_pages`
// (its own crawler infrastructure + JS rendering), so bot-protected/competitor
// sites can still be audited. It is metered through the normal billing client
// (a no-op when Autumn billing is disabled; DataForSEO still charges per page,
// so callers must bound the URL count to maxPages).

// Small batches bound each step's wall time (JS-rendered instant_pages can take
// ~5-15s per URL), and no-retry steps ensure a step replay can never re-bill
// pages that DataForSEO already charged for. A failed batch forfeits only its
// own pages; the loop moves on to the next batch.
const FALLBACK_BATCH_SIZE = 8;
const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
};

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
  const urls = Array.from(new Set(params.seedUrls)).slice(0, params.maxPages);
  if (urls.length === 0) return [];

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
