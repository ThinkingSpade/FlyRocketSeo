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

/**
 * Audit the given seed URLs via DataForSEO instant_pages (JS rendering on).
 * Per-URL failures are skipped so one unreachable page doesn't sink the batch.
 * Returns [] if nothing could be fetched, leaving the audit's existing
 * "couldn't crawl" handling untouched.
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

  return step.do("dataforseo-fallback-crawl", async () => {
    const client = createDataforseoClient(params.billingCustomer);
    const pages: StepPageResult[] = [];
    for (const url of urls) {
      try {
        const item = await client.onPage.instantPage({
          url,
          // Render JS: we only reach this fallback because a plain fetch failed,
          // which is commonly a client-rendered or challenged page.
          enableJavascript: true,
        });
        if (item) {
          pages.push(instantPageToStepPageResult(url, item));
        }
      } catch {
        // DataForSEO couldn't fetch this URL either — skip it, keep the rest.
      }
    }
    return pages;
  });
}
