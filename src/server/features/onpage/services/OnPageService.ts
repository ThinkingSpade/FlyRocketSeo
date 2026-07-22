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
    return parsed.flatMap((entry): ImageRow[] => {
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
      list.toSorted((a, b) => b.impressions - a.impressions).slice(0, QUERIES_PER_PAGE),
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
  return byPage.get(url) ?? byPage.get(trimmed) ?? byPage.get(`${trimmed}/`) ?? [];
}

/** Search Console data is free but optional — never block generation on it. */
async function loadQueriesByPage(projectId: string) {
  try {
    const { startDate, endDate } = resolveDateRange({
      dateRange: "last_28_days",
    });
    const result = await GscService.getPerformance({
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

  const inputs: PageInput[] = pages.map((page) => ({
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
    pagesAnalyzed: pages.length,
    auditId: latest.id,
    usedSearchConsole: queriesByPage.size > 0,
  };
}

export const OnPageService = {
  generate,
  list: PageOptimizationRepository.listForProject,
  setStatus: PageOptimizationRepository.setStatus,
} as const;
