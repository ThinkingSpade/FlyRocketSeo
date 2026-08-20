import { AppError } from "@/server/lib/errors";
import { AuditService } from "@/server/features/audit/services/AuditService";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { PageOptimizationRepository } from "@/server/features/onpage/repositories/PageOptimizationRepository";
import {
  buildSuggestions,
  type PageInput,
} from "@/server/lib/onpage/suggestions";

// query x page rows, so each page knows which searches already find it.
const QUERY_PAGE_ROW_LIMIT = 1000;
// Only the strongest few queries per page matter for a title rewrite.
const QUERIES_PER_PAGE = 5;

type ImageRow = { src: string | null; alt: string | null };

/** Parse the crawl's stored image JSON, tolerating anything unexpected. */
function parseImages(json: string | null): ImageRow[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const items: unknown[] = parsed;
    return items.flatMap((entry): ImageRow[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const record: Record<string, unknown> = { ...entry };
      const src = record.src;
      const alt = record.alt;
      return [
        {
          src: typeof src === "string" ? src : null,
          alt: typeof alt === "string" ? alt : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** GSC rows are keyed [query, page]; group the best queries under each URL. */
function groupQueriesByPage(
  rows: Array<{ keys?: string[]; impressions: number }>,
): Map<string, Array<{ query: string; impressions: number }>> {
  const byPage = new Map<
    string,
    Array<{ query: string; impressions: number }>
  >();
  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    const list = byPage.get(page) ?? [];
    list.push({ query, impressions: row.impressions });
    byPage.set(page, list);
  }
  for (const [page, list] of byPage) {
    byPage.set(
      page,
      list
        .toSorted((a, b) => b.impressions - a.impressions)
        .slice(0, QUERIES_PER_PAGE),
    );
  }
  return byPage;
}

/**
 * A page's queries, matched leniently: Search Console reports canonical URLs,
 * which routinely differ from the crawled URL by a trailing slash alone.
 */
function queriesFor(
  url: string,
  byPage: Map<string, Array<{ query: string; impressions: number }>>,
) {
  const trimmed = url.replace(/\/$/, "");
  return (
    byPage.get(url) ?? byPage.get(trimmed) ?? byPage.get(`${trimmed}/`) ?? []
  );
}

/** Search Console data is free but optional — never block generation on it. */
async function loadQueriesByPage(projectId: string) {
  try {
    const { startDate, endDate } = resolveDateRange({
      dateRange: "last_28_days",
    });
    const result = await GscService.getAnalyticsPerformance({
      projectId,
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: QUERY_PAGE_ROW_LIMIT,
    });
    return groupQueriesByPage(result.rows);
  } catch (error) {
    if (
      error instanceof GscNotConnectedError ||
      isExpectedGrantFailure(error)
    ) {
      return new Map<string, Array<{ query: string; impressions: number }>>();
    }
    throw error;
  }
}

/**
 * Whether the crawl actually got a document back from this URL.
 *
 * Numerically identical to `auditIssues.ts`'s `servedContent`, which the audit
 * issue list applies before it will call a page's content defective:
 * `!isBroken && !isRedirect` reduces to exactly "not null, and 2xx". Written
 * here as the positive test rather than as two negations so that a status
 * nobody has thought about — a 1xx, or the 999 a bot-blocking CDN likes to
 * return — falls out as "not known to be serving" instead of needing a new
 * exclusion added alongside the others. It is also the bound
 * `lighthouse.ts`'s `selectLighthouseSample` already uses to decide which
 * pages are worth spending a Lighthouse run on, so "did this URL serve
 * something?" has one answer across the server.
 *
 * NULL is excluded, deliberately. No write path in this repo can produce one:
 * the crawler records a fetch that never completed — DNS failure, TLS error,
 * timeout, connection refused — as `emptyPageResult(url, 0, ...)`
 * (`site-audit-workflow-helpers.ts`), and the DataForSEO fallback collapses a
 * missing status with `item.status_code ?? 0` (`siteAuditFallbackMapping.ts`),
 * so "never responded" is `0`. The column is nullable only because Drizzle
 * columns default that way, and it has been nullable since migration 0000, so
 * a null cannot even be a row that predates the column. A null therefore means
 * the same thing `0` does with less detail — nothing ever recorded a response
 * for this URL — which is how `isBroken` and `portfolio.ts` already read it.
 * The asymmetry settles it regardless: this list feeds `OnPageAiService`,
 * where a wrongly included row costs a metered LLM rewrite of a URL that
 * serves nothing, and a wrongly excluded one costs a free rule-based
 * suggestion that the next crawl — which will record a real status — restores.
 */
function servedContent(page: { statusCode: number | null }): boolean {
  return (
    page.statusCode != null && page.statusCode >= 200 && page.statusCode < 300
  );
}

/**
 * Regenerate the on-page fix list from the latest completed crawl, informed by
 * the queries each page already earns impressions for. Costs nothing: crawl
 * data is already stored and Search Console is free first-party data.
 */
async function generate(projectId: string, brand: string | null) {
  const history = await AuditService.getHistory(projectId);
  const latest = history.find((audit) => audit.status === "completed");
  if (!latest) {
    throw new AppError(
      "NOT_FOUND",
      "Run a site audit first — on-page fixes are generated from the crawled pages.",
    );
  }

  const [{ pages }, queriesByPage] = await Promise.all([
    AuditService.getResults(latest.id, projectId),
    loadQueriesByPage(projectId),
  ]);

  // Only pages that served a document can have their content judged. A URL
  // that 404s, that never answered, or that only redirects is stored with an
  // empty title, an empty meta description and no H1 (`emptyPageResult`), so
  // without this every one of them matched the missing-title, missing-meta and
  // missing-H1 rules at once and earned rule-based rewrite rows. Those rows
  // are what the "AI rewrite" button sends to `OnPageAiService.rewrite`, the
  // one metered path in the feature — so the agency paid a model to write a
  // title for a URL that serves nothing. `OnPageAiService` cannot defend
  // itself here: it loads suggestions by id and they carry no status, so this
  // is the only place the candidate can be refused.
  const servingPages = pages.filter(servedContent);

  const inputs: PageInput[] = servingPages.map((page) => ({
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription,
    h1Count: page.h1Count,
    images: parseImages(page.imagesJson),
    queries: queriesFor(page.url, queriesByPage),
  }));

  const suggestions = buildSuggestions(inputs, brand);
  const result = await PageOptimizationRepository.replaceRulesSuggestions(
    projectId,
    suggestions,
  );

  return {
    ...result,
    // The count of pages actually analyzed, which is now narrower than the
    // count crawled. Reporting `pages.length` here would have the caller's
    // "Analyzed N pages" toast claim credit for pages this function
    // deliberately skipped.
    pagesAnalyzed: servingPages.length,
    // What was crawled but not analyzed, so an empty tab can say WHY it is
    // empty. `pagesAnalyzed === 0 && pagesSkipped > 0` is precisely "the crawl
    // found no serving pages", which reads very differently from "your pages
    // are all fine" — and the two are indistinguishable from the counts the
    // caller had before.
    pagesSkipped: pages.length - servingPages.length,
    auditId: latest.id,
    usedSearchConsole: queriesByPage.size > 0,
  };
}

export const OnPageService = {
  generate,
  list: PageOptimizationRepository.listForProject,
  setStatus: PageOptimizationRepository.setStatus,
} as const;
