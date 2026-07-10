// Pure aggregation for the client report. Everything here computes from
// payloads the app already fetches (latest rank results, audit results,
// project events) — the report adds no server surface of its own.

import type { RankTrackingRow } from "@/types/schemas/rank-tracking";

export const REPORT_RANGES = {
  "30d": {
    label: "Last 30 days",
    comparePeriod: "30d",
    sinceDays: 30,
    gscRange: "last_28_days",
  },
  "90d": {
    label: "Last 90 days",
    comparePeriod: "90d",
    sinceDays: 90,
    gscRange: "last_3_months",
  },
} as const;

export type ReportRangeKey = keyof typeof REPORT_RANGES;

/** Typed key list for iteration (Object.keys widens to string). */
export const REPORT_RANGE_KEYS = [
  "30d",
  "90d",
] as const satisfies readonly ReportRangeKey[];

/** The device whose positions represent a config in the report. Desktop when
 * tracked (matches the dashboard digest); mobile-only configs use mobile
 * instead of silently reading an empty desktop series. */
export function reportDevice(
  devices: "both" | "desktop" | "mobile",
): "desktop" | "mobile" {
  return devices === "mobile" ? "mobile" : "desktop";
}

// ---------------------------------------------------------------------------
// Movers — biggest ranking changes over the compare period
// ---------------------------------------------------------------------------

export interface ReportMover {
  keyword: string;
  searchVolume: number | null;
  previousPosition: number | null;
  currentPosition: number | null;
  /** previous - current; POSITIVE = moved up. null for new/lost entries. */
  delta: number | null;
}

export interface ReportMovers {
  improved: ReportMover[];
  declined: ReportMover[];
  improvedTotal: number;
  declinedTotal: number;
}

const byVolumeDesc = (a: ReportMover, b: ReportMover) =>
  (b.searchVolume ?? -Infinity) - (a.searchVolume ?? -Infinity) ||
  a.keyword.localeCompare(b.keyword);

/**
 * Split rows into improved/declined movers using the same 4-case null rules
 * as the scorecards: a new entry counts as improved, a lost ranking as
 * declined, and we never subtract through a null. Within each list, ranked
 * moves sort by |delta| first; new/lost entries follow, by search volume —
 * so "jumped 12 spots" outranks "appeared at #18" on a capped print list.
 */
export function computeMovers(
  rows: readonly RankTrackingRow[],
  device: "desktop" | "mobile",
  cap = 8,
): ReportMovers {
  const improved: ReportMover[] = [];
  const declined: ReportMover[] = [];

  for (const row of rows) {
    const { position, previousPosition } = row[device];
    const mover: ReportMover = {
      keyword: row.keyword,
      searchVolume: row.searchVolume,
      previousPosition,
      currentPosition: position,
      delta:
        position !== null && previousPosition !== null
          ? previousPosition - position
          : null,
    };

    if (position === null && previousPosition === null) continue;
    if (position === null) declined.push(mover);
    else if (previousPosition === null) improved.push(mover);
    else if (mover.delta! > 0) improved.push(mover);
    else if (mover.delta! < 0) declined.push(mover);
  }

  const rankedFirst =
    (direction: 1 | -1) => (a: ReportMover, b: ReportMover) => {
      if (a.delta !== null && b.delta !== null) {
        return direction * (b.delta - a.delta) || byVolumeDesc(a, b);
      }
      if (a.delta !== null) return -1;
      if (b.delta !== null) return 1;
      return byVolumeDesc(a, b);
    };
  improved.sort(rankedFirst(1));
  declined.sort(rankedFirst(-1));

  return {
    improved: improved.slice(0, cap),
    declined: declined.slice(0, cap),
    improvedTotal: improved.length,
    declinedTotal: declined.length,
  };
}

/** Mean of non-null positions for the device, current and comparison. */
export function computeAveragePositions(
  rows: readonly RankTrackingRow[],
  device: "desktop" | "mobile",
): { current: number | null; previous: number | null } {
  let currentSum = 0;
  let currentCount = 0;
  let previousSum = 0;
  let previousCount = 0;
  for (const row of rows) {
    const { position, previousPosition } = row[device];
    if (position !== null) {
      currentSum += position;
      currentCount += 1;
    }
    if (previousPosition !== null) {
      previousSum += previousPosition;
      previousCount += 1;
    }
  }
  return {
    current: currentCount ? currentSum / currentCount : null,
    previous: previousCount ? previousSum / previousCount : null,
  };
}

// ---------------------------------------------------------------------------
// Events — journal entries inside the report window
// ---------------------------------------------------------------------------

export interface ReportEventLike {
  id: string;
  eventDate: string;
  title: string;
  note: string | null;
}

/** Events dated within the last `sinceDays` of `nowMs` (inclusive), oldest
 * first — a report timeline reads chronologically. */
export function filterEventsToRange<T extends ReportEventLike>(
  events: readonly T[],
  sinceDays: number,
  nowMs: number,
): T[] {
  const start = new Date(nowMs - sinceDays * 24 * 60 * 60 * 1000);
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return events
    .filter((event) => event.eventDate >= startKey)
    .toSorted((a, b) => a.eventDate.localeCompare(b.eventDate));
}

// ---------------------------------------------------------------------------
// Site health — latest completed audit
// ---------------------------------------------------------------------------

interface AuditPageLike {
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number;
  imagesMissingAlt: number;
  isIndexable: boolean;
}

interface LighthouseLike {
  strategy: "mobile" | "desktop";
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
}

export interface LighthouseAverages {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  sampleSize: number;
}

export interface AuditHealth {
  pagesCrawled: number;
  okPages: number;
  redirectPages: number;
  /** 4xx/5xx plus pages whose fetch produced no status at all. */
  brokenPages: number;
  indexablePages: number;
  missingTitle: number;
  missingDescription: number;
  missingH1: number;
  /** Content pages under 300 words — the usual thin-content heuristic. */
  thinContent: number;
  imagesMissingAlt: number;
  lighthouse: { mobile: LighthouseAverages; desktop: LighthouseAverages };
}

const THIN_CONTENT_WORDS = 300;

function lighthouseAverages(
  results: readonly LighthouseLike[],
  strategy: "mobile" | "desktop",
): LighthouseAverages {
  const rows = results.filter((row) => row.strategy === strategy);
  const average = (pick: (row: LighthouseLike) => number | null) => {
    const values = rows
      .map(pick)
      .filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    return values.reduce((total, value) => total + value, 0) / values.length;
  };
  return {
    performance: average((row) => row.performanceScore),
    accessibility: average((row) => row.accessibilityScore),
    bestPractices: average((row) => row.bestPracticesScore),
    seo: average((row) => row.seoScore),
    sampleSize: rows.length,
  };
}

const isOkPage = (page: AuditPageLike) =>
  page.statusCode !== null && page.statusCode >= 200 && page.statusCode < 300;

export function computeAuditHealth(
  pages: readonly AuditPageLike[],
  lighthouse: readonly LighthouseLike[],
): AuditHealth {
  const okPagesList = pages.filter(isOkPage);

  // On-page checks only make sense for pages that actually rendered content;
  // a redirect or 404 "missing" its title is noise, not an issue.
  return {
    pagesCrawled: pages.length,
    okPages: okPagesList.length,
    redirectPages: pages.filter(
      (page) =>
        page.statusCode !== null &&
        page.statusCode >= 300 &&
        page.statusCode < 400,
    ).length,
    brokenPages: pages.filter(
      (page) => page.statusCode === null || page.statusCode >= 400,
    ).length,
    indexablePages: okPagesList.filter((page) => page.isIndexable).length,
    missingTitle: okPagesList.filter((page) => !page.title).length,
    missingDescription: okPagesList.filter((page) => !page.metaDescription)
      .length,
    missingH1: okPagesList.filter((page) => page.h1Count === 0).length,
    thinContent: okPagesList.filter(
      (page) => page.wordCount > 0 && page.wordCount < THIN_CONTENT_WORDS,
    ).length,
    imagesMissingAlt: okPagesList.reduce(
      (total, page) => total + page.imagesMissingAlt,
      0,
    ),
    lighthouse: {
      mobile: lighthouseAverages(lighthouse, "mobile"),
      desktop: lighthouseAverages(lighthouse, "desktop"),
    },
  };
}

/** The audit findings a client cares about, as label/count rows (zero-count
 * rows are omitted). Shared by the on-screen list and the markdown export. */
export function auditIssueRows(health: AuditHealth): Array<{
  label: string;
  count: number;
}> {
  return [
    {
      label: "Broken pages (4xx/5xx or unreachable)",
      count: health.brokenPages,
    },
    { label: "Redirected pages", count: health.redirectPages },
    {
      label: "Pages excluded from indexing",
      count: health.okPages - health.indexablePages,
    },
    { label: "Missing title tag", count: health.missingTitle },
    { label: "Missing meta description", count: health.missingDescription },
    { label: "Missing H1 heading", count: health.missingH1 },
    { label: "Thin content (under 300 words)", count: health.thinContent },
    { label: "Images missing alt text", count: health.imagesMissingAlt },
  ].filter((row) => row.count > 0);
}
