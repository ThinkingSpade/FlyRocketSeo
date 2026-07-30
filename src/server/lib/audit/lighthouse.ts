import { detectUrlTemplate } from "./url-utils";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { LighthouseResult, LighthouseStrategy } from "./types";
import { putTextToR2 } from "@/server/lib/r2";

interface LighthouseSamplePage {
  url: string;
  statusCode: number;
}

type LighthouseFetchResult = {
  result: LighthouseResult;
  payloadJson: string | null;
};

/** Uploading the payload is FREE, so unlike the provider call it is safe to
 *  retry -- and it sits inside a workflow step that will never be replayed. */
const MAX_PAYLOAD_UPLOAD_ATTEMPTS = 3;

async function fetchLighthouseResult(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
  billingCustomer: BillingCustomerContext,
): Promise<LighthouseFetchResult> {
  let lastError: Error | null = null;
  const dataforseo = createDataforseoClient(billingCustomer);

  // ONE attempt. `lighthouse.live` is a billed POST: a failure gives us no way
  // to know whether DataForSEO already ran the audit and charged for it, so a
  // retry can buy the same audit twice.
  //
  // This loop used to run three times, and the transport layer beneath it
  // retried any 5xx twice on top, so a single strategy could issue up to nine
  // billable HTTP calls. The transport no longer retries POSTs at all; this
  // layer must not reintroduce it. A failed page is recorded as failed --
  // AuditRepository persists errorMessage with null scores -- which is the
  // honest outcome and costs nothing.
  const MAX_LIGHTHOUSE_ATTEMPTS = 1;

  for (let attempt = 0; attempt < MAX_LIGHTHOUSE_ATTEMPTS; attempt++) {
    try {
      const data = await dataforseo.lighthouse.live({ url, strategy });

      return {
        result: {
          url,
          pageId,
          strategy,
          performanceScore: data.scores.performance,
          accessibilityScore: data.scores.accessibility,
          bestPracticesScore: data.scores["best-practices"],
          seoScore: data.scores.seo,
          lcpMs: data.metrics.largestContentfulPaint.numericValue,
          cls: data.metrics.cumulativeLayoutShift.numericValue,
          inpMs: data.metrics.interactionToNextPaint.numericValue,
          ttfbMs: data.metrics.serverResponseTime.numericValue,
        },
        payloadJson: JSON.stringify(data),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `Lighthouse attempt ${attempt + 1} of ${MAX_LIGHTHOUSE_ATTEMPTS} failed for ${url}:`,
        lastError.message,
      );
    }
  }

  // Not retried on purpose (see above) — record the failure and move on.
  console.error(`Lighthouse failed for ${url}:`, lastError?.message);
  return {
    result: {
      url,
      pageId,
      strategy,
      performanceScore: null,
      accessibilityScore: null,
      bestPracticesScore: null,
      seoScore: null,
      lcpMs: null,
      cls: null,
      inpMs: null,
      ttfbMs: null,
      errorMessage: lastError?.message ?? "Lighthouse request failed",
    },
    payloadJson: null,
  };
}

export async function fetchAndStoreLighthouseResult(input: {
  url: string;
  pageId: string;
  strategy: "mobile" | "desktop";
  billingCustomer: BillingCustomerContext;
  projectId: string;
  auditId: string;
}): Promise<LighthouseResult> {
  const fetched = await fetchLighthouseResult(
    input.url,
    input.pageId,
    input.strategy,
    input.billingCustomer,
  );

  if (!fetched.payloadJson) {
    return fetched.result;
  }

  const key = `site-audit/${input.projectId}/${input.auditId}/${input.pageId}-${input.strategy}.json`;

  // Storage failure must not discard the scores we just PAID for -- but it must
  // not be swallowed either.
  //
  // Throwing here used to fail the ENTIRE audit: the surrounding workflow step
  // has zero retries (so a paid batch can never be replayed), and one transient
  // R2 503 rejected the whole Promise.all after all 20 provider calls were
  // billed. The provider call must not be replayed because it costs money;
  // uploading its output is FREE, so that is the part worth retrying.
  //
  // Retry the upload here, inside the non-replayable step. If every attempt
  // fails the scores are still returned, because they are the audit result and
  // the payload is only the detail view behind "View issues".
  //
  // Residual gap, deliberately not fixed here: a row with scores and no `r2Key`
  // is indistinguishable in the database from an older row that never had a
  // payload, so the failure is visible only in logs. Making it visible in the UI
  // needs a `payloadStatus` column and a migration -- worth doing, out of scope
  // for this branch.
  let lastUploadError: unknown = null;
  for (let attempt = 0; attempt < MAX_PAYLOAD_UPLOAD_ATTEMPTS; attempt++) {
    try {
      const uploaded = await putTextToR2(key, fetched.payloadJson);
      return {
        ...fetched.result,
        r2Key: uploaded.key,
        payloadSizeBytes: uploaded.sizeBytes,
      };
    } catch (error) {
      lastUploadError = error;
    }
  }

  console.error(
    `Lighthouse payload upload failed ${MAX_PAYLOAD_UPLOAD_ATTEMPTS}x for ${input.url} (${input.strategy}) in audit ${input.auditId}; keeping the scores, losing the payload:`,
    lastUploadError instanceof Error
      ? lastUploadError.message
      : String(lastUploadError),
  );
  return fetched.result;
}

/**
 * Select which pages to run Lighthouse on, based on the chosen strategy.
 */
export function selectLighthouseSample(
  pages: LighthouseSamplePage[],
  startUrl: string,
  strategy: LighthouseStrategy,
): string[] {
  if (strategy === "none") return [];

  // Only consider pages that loaded successfully
  const validPages = pages.filter(
    (p) => p.statusCode >= 200 && p.statusCode < 300,
  );

  // strategy === "auto": homepage + 1 per URL pattern, capped at 10
  const selected = new Set<string>();

  // Always include the start URL / homepage
  const startPage = validPages.find((p) => p.url === startUrl);
  if (startPage) selected.add(startPage.url);

  // Group by URL template pattern
  const templateGroups = new Map<string, LighthouseSamplePage>();
  for (const page of validPages) {
    if (selected.has(page.url)) continue;
    const template = detectUrlTemplate(new URL(page.url).pathname);
    if (!templateGroups.has(template)) {
      templateGroups.set(template, page);
    }
  }

  // Add one page per template group
  for (const [, page] of templateGroups) {
    if (selected.size >= 10) break;
    selected.add(page.url);
  }

  return Array.from(selected);
}
