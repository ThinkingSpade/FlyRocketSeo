import type { WorkflowStep } from "cloudflare:workers";
import type { RobotsResult } from "@/server/lib/audit/discovery";
import type { StepPageResult } from "@/server/lib/audit/types";
import { isSameOrigin, normalizeUrl } from "@/server/lib/audit/url-utils";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import { crawlPage } from "@/server/workflows/site-audit-workflow-helpers";
import { pgStep } from "@/server/workflows/pgStep";
import { runDataforseoFallbackCrawl } from "@/server/workflows/siteAuditWorkflowFallback";
import type { BillingCustomerContext } from "@/server/billing/subscription";

// Small batches keep each crawl step's CPU within the Worker limit: analyzeHtml()
// runs a full cheerio parse + body-clone per page, so parsing many pages in one
// step invocation blows the CPU ceiling and fails the step. That ceiling is
// tight and non-configurable on the Cloudflare Free plan (`cpu_ms` can't be set
// there), so we keep batches small and lean on the DataForSEO fallback below
// when the free crawl still can't finish. 8 pages/step is comfortable on paid.
const CRAWL_CONCURRENCY = 8;

// crawlPage swallows its own fetch/parse errors (returns an empty result), so
// the only way a crawl-batch step throws is the isolate being killed for a
// resource limit (CPU/memory) — which retrying can't fix. Cap retries at 1 so a
// batch that can't fit the CPU budget fails fast into the DataForSEO fallback
// instead of burning minutes on backoff before the audit gives up.
const CRAWL_BATCH_STEP_CONFIG = {
  retries: { limit: 1, delay: "2 seconds" as const },
};

function shouldQueueCrawlLink(
  link: string,
  origin: string,
  robots: RobotsResult,
  visited: Set<string>,
  queued: Set<string>,
): boolean {
  return (
    isSameOrigin(link, origin) &&
    robots.isAllowed(link) &&
    !visited.has(link) &&
    !queued.has(link)
  );
}

type CrawlPhaseParams = {
  auditId: string;
  workflowInstanceId: string;
  origin: string;
  startUrl: string;
  maxPages: number;
  robots: RobotsResult;
  sitemapUrls: string[];
  billingCustomer: BillingCustomerContext;
};

export async function runCrawlPhase(
  step: WorkflowStep,
  params: CrawlPhaseParams,
): Promise<StepPageResult[]> {
  const {
    auditId,
    workflowInstanceId,
    origin,
    startUrl,
    maxPages,
    robots,
    sitemapUrls,
    billingCustomer,
  } = params;
  const visited = new Set<string>();
  const queue: string[] = [];
  const queued = new Set<string>();
  const allPages: StepPageResult[] = [];

  seedCrawlQueue({
    startUrl,
    origin,
    robots,
    sitemapUrls,
    visited,
    queued,
    queue,
  });

  let crawlBatchIndex = 0;
  try {
    while (queue.length > 0 && allPages.length < maxPages) {
      const urlsToCrawl = selectNextCrawlBatch(
        queue,
        queued,
        visited,
        robots,
        maxPages - allPages.length,
      );
      if (urlsToCrawl.length === 0) continue;

      crawlBatchIndex += 1;
      const crawledBatch = await runCrawlBatch(
        step,
        crawlBatchIndex,
        urlsToCrawl,
        origin,
      );
      allPages.push(...crawledBatch);

      enqueueDiscoveredLinks({
        crawledBatch,
        queue,
        queued,
        visited,
        origin,
        robots,
      });
      await persistCrawlProgress({
        step,
        crawlBatchIndex,
        auditId,
        workflowInstanceId,
        crawledBatch,
        pagesCrawled: allPages.length,
        visitedCount: visited.size,
        queueLength: queue.length,
        maxPages,
      });
    }
  } catch (crawlError) {
    // A crawl-batch step exhausted its retries — almost always the isolate
    // being killed for a CPU/memory limit while parsing a batch (uncatchable
    // inside crawlPage, so it surfaces here as a step failure). Don't let that
    // hard-fail the whole audit: fall through to the DataForSEO fallback below,
    // which parses server-side (no local cheerio). Any pages already crawled are
    // kept, and a non-empty result skips the fallback.
    console.warn(
      "[audit-fallback] free crawl phase threw; falling through to DataForSEO",
      {
        pagesSoFar: allPages.length,
        error:
          crawlError instanceof Error
            ? `${crawlError.name}: ${crawlError.message.slice(0, 300)}`
            : String(crawlError).slice(0, 300),
      },
    );
  }

  // Free crawler returned nothing (blocked by anti-bot/firewall, or the pages
  // are client-rendered). Fall back to DataForSEO's crawler on the discovered
  // seed URLs so bot-protected/competitor sites still audit. Any error here
  // leaves allPages empty — the same "couldn't crawl" outcome as before — so
  // the fallback can only help, never make a working audit worse.
  if (allPages.length === 0) {
    try {
      const fallbackPages = await runDataforseoFallbackCrawl(step, {
        seedUrls: [startUrl, ...sitemapUrls],
        billingCustomer,
        maxPages,
      });
      if (fallbackPages.length > 0) {
        allPages.push(...fallbackPages);
        await persistFallbackProgress({
          step,
          auditId,
          workflowInstanceId,
          pages: fallbackPages,
        });
      }
    } catch (error) {
      // DataForSEO fallback also failed; fall through with an empty result and
      // let the existing "couldn't fully crawl" handling take over. Log the
      // reason (sanitized) so a failed fallback is diagnosable via wrangler tail.
      console.warn("[audit-fallback] fallback errored; audit stays failed", {
        error:
          error instanceof Error
            ? `${error.name}: ${error.message.slice(0, 300)}`
            : String(error).slice(0, 300),
      });
    }
  }

  return allPages;
}

function seedCrawlQueue({
  startUrl,
  origin,
  robots,
  sitemapUrls,
  visited,
  queued,
  queue,
}: {
  startUrl: string;
  origin: string;
  robots: RobotsResult;
  sitemapUrls: string[];
  visited: Set<string>;
  queued: Set<string>;
  queue: string[];
}) {
  const normalizedStart = normalizeUrl(startUrl) ?? startUrl;
  if (
    robots.isAllowed(normalizedStart) &&
    isSameOrigin(normalizedStart, origin)
  ) {
    queue.push(normalizedStart);
    queued.add(normalizedStart);
  }

  for (const sitemapUrl of sitemapUrls) {
    const normalized = normalizeUrl(sitemapUrl);
    if (!normalized) continue;
    if (!shouldQueueCrawlLink(normalized, origin, robots, visited, queued)) {
      continue;
    }
    queue.push(normalized);
    queued.add(normalized);
  }
}

function selectNextCrawlBatch(
  queue: string[],
  queued: Set<string>,
  visited: Set<string>,
  robots: RobotsResult,
  remaining: number,
) {
  const batchSize = Math.min(CRAWL_CONCURRENCY, remaining);
  const urlsToCrawl: string[] = [];

  while (queue.length > 0 && urlsToCrawl.length < batchSize) {
    const url = queue.shift()!;
    queued.delete(url);
    if (visited.has(url)) continue;
    if (!robots.isAllowed(url)) continue;
    visited.add(url);
    urlsToCrawl.push(url);
  }

  return urlsToCrawl;
}

async function runCrawlBatch(
  step: WorkflowStep,
  crawlBatchIndex: number,
  urlsToCrawl: string[],
  origin: string,
): Promise<StepPageResult[]> {
  return step.do(
    `crawl-batch-${crawlBatchIndex}`,
    CRAWL_BATCH_STEP_CONFIG,
    async () => {
      const settled = await Promise.allSettled(
        urlsToCrawl.map((url) => crawlPage(url, origin)),
      );
      return settled.flatMap((result) => {
        if (result.status === "fulfilled" && result.value) {
          return [result.value];
        }
        return [];
      });
    },
  );
}

function enqueueDiscoveredLinks(params: {
  crawledBatch: StepPageResult[];
  queue: string[];
  queued: Set<string>;
  visited: Set<string>;
  origin: string;
  robots: RobotsResult;
}) {
  const { crawledBatch, queue, queued, visited, origin, robots } = params;
  for (const pageResult of crawledBatch) {
    for (const link of pageResult.internalLinks.filter((candidate) =>
      shouldQueueCrawlLink(candidate, origin, robots, visited, queued),
    )) {
      queue.push(link);
      queued.add(link);
    }
  }
}

async function persistCrawlProgress(params: {
  step: WorkflowStep;
  crawlBatchIndex: number;
  auditId: string;
  workflowInstanceId: string;
  crawledBatch: StepPageResult[];
  pagesCrawled: number;
  visitedCount: number;
  queueLength: number;
  maxPages: number;
}) {
  const {
    step,
    crawlBatchIndex,
    auditId,
    workflowInstanceId,
    crawledBatch,
    pagesCrawled,
    visitedCount,
    queueLength,
    maxPages,
  } = params;
  await step.do(`kv-progress-batch-${crawlBatchIndex}`, async () => {
    await AuditProgressKV.pushCrawledUrls(
      auditId,
      crawledBatch.map((pageResult) => ({
        url: pageResult.url,
        statusCode: pageResult.statusCode,
        title: pageResult.title,
        crawledAt: Date.now(),
      })),
    );
  });

  await pgStep(
    step,
    `progress-batch-${crawlBatchIndex}`,
    undefined,
    async () => {
      await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
        pagesCrawled,
        pagesTotal: Math.min(visitedCount + queueLength, maxPages),
      });
    },
  );
}

async function persistFallbackProgress(params: {
  step: WorkflowStep;
  auditId: string;
  workflowInstanceId: string;
  pages: StepPageResult[];
}) {
  const { step, auditId, workflowInstanceId, pages } = params;
  await step.do("kv-progress-fallback", async () => {
    await AuditProgressKV.pushCrawledUrls(
      auditId,
      pages.map((pageResult) => ({
        url: pageResult.url,
        statusCode: pageResult.statusCode,
        title: pageResult.title,
        crawledAt: Date.now(),
      })),
    );
  });

  await pgStep(step, "progress-fallback", undefined, async () => {
    await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
      pagesCrawled: pages.length,
      pagesTotal: pages.length,
    });
  });
}
