import { isLighthouseFailure } from "@/client/features/audit/results/AuditResultsTableFilterLogic";

// How many points a Lighthouse category score must move before a page shared
// between two runs counts as "changed". Lighthouse scores jitter a few points
// run-to-run, so a small threshold keeps the changed-page count meaningful.
export const LIGHTHOUSE_CHANGE_THRESHOLD = 5;

type LighthouseScoreKey =
  | "performanceScore"
  | "seoScore"
  | "accessibilityScore";

// Minimal shapes needed to diff two runs. The real getAuditResults rows carry
// more fields, but these keep the pure logic (and its tests) focused on what we
// actually compare.
export interface DiffPage {
  id: string;
  url: string;
  statusCode: number | null;
}

export interface DiffLighthouseRow {
  pageId: string;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  errorMessage: string | null;
}

export interface AuditRunData {
  pages: DiffPage[];
  lighthouse: DiffLighthouseRow[];
}

export interface LighthouseSummary {
  failed: number;
  avgPerformance: number | null;
  avgSeo: number | null;
  avgAccessibility: number | null;
}

export interface PageRef {
  url: string;
  statusCode: number | null;
}

export interface ChangedPage {
  url: string;
  currentStatus: number | null;
  previousStatus: number | null;
  statusChanged: boolean;
  performanceDelta: number | null;
  seoDelta: number | null;
  accessibilityDelta: number | null;
}

export interface AuditDiff {
  newPages: PageRef[];
  removedPages: PageRef[];
  changedPages: ChangedPage[];
  currentPageCount: number;
  comparisonPageCount: number;
  pageCountDelta: number;
  hasLighthouse: boolean;
  lighthouse: {
    current: LighthouseSummary;
    comparison: LighthouseSummary;
    performanceDelta: number | null;
    seoDelta: number | null;
    accessibilityDelta: number | null;
  };
}

interface UrlSnapshot {
  statusCode: number | null;
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
}

function averageScore(
  rows: DiffLighthouseRow[],
  key: LighthouseScoreKey,
): number | null {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => value != null);
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function subtract(
  current: number | null,
  previous: number | null,
): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

// Mirrors the aggregation in ResultsView's useResultStats so the current-run
// stat cards and the comparison deltas stay in lockstep.
export function computeLighthouseSummary(
  lighthouse: DiffLighthouseRow[],
): LighthouseSummary {
  const failed = lighthouse.filter((row) => isLighthouseFailure(row)).length;
  const successful = lighthouse.filter((row) => !isLighthouseFailure(row));
  return {
    failed,
    avgPerformance: averageScore(successful, "performanceScore"),
    avgSeo: averageScore(successful, "seoScore"),
    avgAccessibility: averageScore(successful, "accessibilityScore"),
  };
}

// Collapse a run into one snapshot per page URL: its HTTP status plus the mean
// Lighthouse category scores across that page's rows (mobile + desktop).
function buildUrlSnapshots(run: AuditRunData): Map<string, UrlSnapshot> {
  const rowsByPage = new Map<string, DiffLighthouseRow[]>();
  for (const row of run.lighthouse) {
    const existing = rowsByPage.get(row.pageId);
    if (existing) existing.push(row);
    else rowsByPage.set(row.pageId, [row]);
  }

  const snapshots = new Map<string, UrlSnapshot>();
  for (const page of run.pages) {
    const rows = rowsByPage.get(page.id) ?? [];
    snapshots.set(page.url, {
      statusCode: page.statusCode,
      performance: averageScore(rows, "performanceScore"),
      seo: averageScore(rows, "seoScore"),
      accessibility: averageScore(rows, "accessibilityScore"),
    });
  }
  return snapshots;
}

function scoreMoved(delta: number | null): boolean {
  return delta != null && Math.abs(delta) > LIGHTHOUSE_CHANGE_THRESHOLD;
}

/**
 * Diff a current audit run against an older comparison run. Pages are matched
 * on their URL; a shared page is "changed" when its HTTP status differs or any
 * Lighthouse category score moved beyond LIGHTHOUSE_CHANGE_THRESHOLD.
 */
export function computeAuditDiff(
  current: AuditRunData,
  comparison: AuditRunData,
): AuditDiff {
  const currentSnapshots = buildUrlSnapshots(current);
  const comparisonSnapshots = buildUrlSnapshots(comparison);

  const newPages: PageRef[] = [];
  const changedPages: ChangedPage[] = [];
  for (const [url, curr] of currentSnapshots) {
    const prev = comparisonSnapshots.get(url);
    if (!prev) {
      newPages.push({ url, statusCode: curr.statusCode });
      continue;
    }

    const statusChanged = curr.statusCode !== prev.statusCode;
    const performanceDelta = subtract(curr.performance, prev.performance);
    const seoDelta = subtract(curr.seo, prev.seo);
    const accessibilityDelta = subtract(curr.accessibility, prev.accessibility);
    const scoreChanged =
      scoreMoved(performanceDelta) ||
      scoreMoved(seoDelta) ||
      scoreMoved(accessibilityDelta);

    if (statusChanged || scoreChanged) {
      changedPages.push({
        url,
        currentStatus: curr.statusCode,
        previousStatus: prev.statusCode,
        statusChanged,
        performanceDelta,
        seoDelta,
        accessibilityDelta,
      });
    }
  }

  const removedPages: PageRef[] = [];
  for (const [url, prev] of comparisonSnapshots) {
    if (!currentSnapshots.has(url)) {
      removedPages.push({ url, statusCode: prev.statusCode });
    }
  }

  newPages.sort((a, b) => a.url.localeCompare(b.url));
  removedPages.sort((a, b) => a.url.localeCompare(b.url));
  changedPages.sort((a, b) => a.url.localeCompare(b.url));

  const currentLighthouse = computeLighthouseSummary(current.lighthouse);
  const comparisonLighthouse = computeLighthouseSummary(comparison.lighthouse);

  return {
    newPages,
    removedPages,
    changedPages,
    currentPageCount: current.pages.length,
    comparisonPageCount: comparison.pages.length,
    pageCountDelta: current.pages.length - comparison.pages.length,
    hasLighthouse:
      current.lighthouse.length > 0 || comparison.lighthouse.length > 0,
    lighthouse: {
      current: currentLighthouse,
      comparison: comparisonLighthouse,
      performanceDelta: subtract(
        currentLighthouse.avgPerformance,
        comparisonLighthouse.avgPerformance,
      ),
      seoDelta: subtract(currentLighthouse.avgSeo, comparisonLighthouse.avgSeo),
      accessibilityDelta: subtract(
        currentLighthouse.avgAccessibility,
        comparisonLighthouse.avgAccessibility,
      ),
    },
  };
}
